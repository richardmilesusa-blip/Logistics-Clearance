import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { query } from '../config/database';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { auditLog } from '../middleware/auditLogger';
import { z } from 'zod';

const router = Router();

// Zod schemas for validation
const uploadQuerySchema = z.object({
  doc_type: z.enum([
    'paar', 'tdo', 'bl', 'pod', 'examination_report', 
    'son_cert', 'nafdac_cert', 'ccvo', 'form_m', 'invoice', 'other'
  ])
});

// Setup multer memory storage for handling form-data files
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Lazy loader for S3 Client to prevent boot crashes if environment keys are unset
let s3ClientInstance: S3Client | null = null;
function getS3Client(): S3Client {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'eu-west-1';

  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKeyId || 'dummy-access-key-id',
        secretAccessKey: secretAccessKey || 'dummy-secret-access-key'
      }
    });
  }
  return s3ClientInstance;
}

/**
 * Helper to generate S3 pre-signed URL for GET operations, valid for 1 hour.
 */
async function generatePresignedDownloadUrl(fileKey: string): Promise<string> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    return `https://mock-presigned-url.com/${fileKey}?expires=3600&missing_bucket_configuration=true`;
  }

  try {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey
    });
    // 3600 seconds = 1 hour
    const url = await getSignedUrl(client, command, { expiresIn: 3600 });
    return url;
  } catch (err: any) {
    return `https://mock-presigned-url.com/${fileKey}?expires=3600&error=${encodeURIComponent(err.message)}`;
  }
}

/**
 * POST /api/jobs/:jobId/documents
 * Handles file uploads via multipart/form-data.
 * Uploads file to Amazon S3 bucket, inserts documents record in database, and returns a 1hr signed download URL.
 */
router.post(
  '/:jobId/documents',
  verifyJwt,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const file = req.file;

      if (!file) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'No file was parsed from request. Please attach file to "file" body parameter.'
          }
        });
        return;
      }

      // Check params validation
      const queryValidation = uploadQuerySchema.safeParse({ doc_type: req.body.doc_type });
      if (!queryValidation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Inbound doc_type fails validation or is missing.',
            details: queryValidation.error.flatten().fieldErrors
          }
        });
        return;
      }

      const docType = queryValidation.data.doc_type;

      // Ensure Job exists
      const jobCheck = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
      if (jobCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Specified job shipment details do not exist.'
          }
        });
        return;
      }

      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) {
        throw new Error('S3_BUCKET_NAME environment variable is required to process uploads.');
      }

      const uniqueId = uuidv4();
      // Key format: jobs/{jobId}/{doc_type}/{uuid}-{originalname}
      const fileKey = `jobs/${jobId}/${docType}/${uniqueId}-${file.originalname.replace(/\s+/g, '_')}`;

      // Upload payload buffer to AWS S3 bucket
      const s3Client = getS3Client();
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: fileKey,
          Body: file.buffer,
          ContentType: file.mimetype
        })
      );

      // Save documents record down inside PostgreSQL DB
      const insertSql = `
        INSERT INTO documents (
          job_id,
          doc_type,
          file_name,
          file_key,
          mime_type,
          file_size_bytes,
          uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const dbRes = await query(insertSql, [
        jobId,
        docType,
        file.originalname,
        fileKey,
        file.mimetype,
        file.size,
        req.user!.id
      ]);

      const savedDoc = dbRes.rows[0];

      // Retrieve temporal download link
      const signedUrl = await generatePresignedDownloadUrl(fileKey);

      // Save audit trace
      await auditLog(
        req,
        'document_uploaded',
        'documents',
        savedDoc.id,
        null,
        savedDoc,
        jobId
      );

      res.status(201).json({
        success: true,
        message: 'File successfully stored and registered in database repository.',
        data: {
          ...savedDoc,
          download_url: signedUrl
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred uploading the requested document to S3 client.',
          details: error.message
        }
      });
    }
  }
);

/**
 * GET /api/jobs/:jobId/documents
 * List all registered documents for a specified job alongside live signed download URLs.
 */
router.get('/:jobId/documents', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    // Check parent exists
    const checkRes = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
    if (checkRes.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'The requested job shipment metadata is not found.'
        }
      });
      return;
    }

    const selectSql = `
      SELECT 
        d.id, 
        d.job_id, 
        d.doc_type, 
        d.file_name, 
        d.file_key, 
        d.mime_type, 
        d.file_size_bytes, 
        d.uploaded_by, 
        d.created_at, 
        u.full_name as uploaded_by_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.job_id = $1
      ORDER BY d.created_at DESC
    `;

    const docsRes = await query(selectSql, [jobId]);
    const documents = docsRes.rows;

    // Dynamically append signed URLs for each Document
    const mappedDocuments = [];
    for (const doc of documents) {
      const signedUrl = await generatePresignedDownloadUrl(doc.file_key);
      mappedDocuments.push({
        ...doc,
        download_url: signedUrl
      });
    }

    res.status(200).json({
      success: true,
      data: mappedDocuments
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Encountered database query error listing job documentation details.',
        details: error.message
      }
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Database records cleaning removal ONLY — S3 files are safely left in place (soft database deletion).
 * Role access: senior_admin only.
 */
router.delete(
  '/:id',
  verifyJwt,
  requireRole('senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Retrieve file info first for audit tracing
      const checkSql = `SELECT * FROM documents WHERE id = $1`;
      const docCheck = await query(checkSql, [id]);
      if (docCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Target document record not found.'
          }
        });
        return;
      }

      const originalDoc = docCheck.rows[0];

      // Remove row from DB (Do NOT delete from S3 storage as requested)
      const deleteSql = `DELETE FROM documents WHERE id = $1`;
      await query(deleteSql, [id]);

      // Audit compliance logs
      await auditLog(
        req,
        'document_deleted',
        'documents',
        id,
        originalDoc,
        null,
        originalDoc.job_id
      );

      res.status(200).json({
        success: true,
        message: 'Document database reference removed successfully. Object remains saved on cloud vaults.'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred removing the document reference row.',
          details: error.message
        }
      });
    }
  }
);

export default router;
