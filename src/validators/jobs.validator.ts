import { z } from 'zod';

export const createJobSchema = z.object({
  container_no: z.string().min(1, 'Container number is required').max(20),
  bl_number: z.string().min(1, 'Bill of lading number is required').max(50),
  shipping_line: z.string().min(1, 'Shipping line is required').max(100),
  vessel_name: z.string().max(100).optional().nullable(),
  voyage_no: z.string().max(30).optional().nullable(),
  port_of_loading: z.string().max(100).optional().nullable(),
  port_of_discharge: z.string().min(1, 'Port of discharge is required').max(100),
  cargo_description: z.string().min(1, 'Cargo description is required'),
  hs_code: z.string().max(20).optional().nullable(),
  gross_weight_kg: z.number().positive().optional().nullable(),
  container_seal_no: z.string().max(50).optional().nullable(),
  client_id: z.string().uuid('Invalid client_id UUID'),
  assigned_broker_id: z.string().uuid('Invalid assigned_broker_id UUID').optional().nullable(),
  assigned_forwarder_id: z.string().uuid('Invalid assigned_forwarder_id UUID').optional().nullable(),
  notes: z.string().optional().nullable(),
  eta_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid eta_date format' }).optional().nullable(),
  actual_arrival_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid actual_arrival_date format' }).optional().nullable()
});

export const updateJobSchema = z.object({
  shipping_line: z.string().min(1).max(100).optional(),
  vessel_name: z.string().max(100).optional().nullable(),
  voyage_no: z.string().max(30).optional().nullable(),
  cargo_description: z.string().min(1).optional(),
  hs_code: z.string().max(20).optional().nullable(),
  gross_weight_kg: z.number().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
  assigned_broker_id: z.string().uuid().optional().nullable(),
  assigned_forwarder_id: z.string().uuid().optional().nullable(),
  eta_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid eta_date format' }).optional().nullable(),
  actual_arrival_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid actual_arrival_date format' }).optional().nullable()
});

export const transitionStatusSchema = z.object({
  status: z.enum(['created', 'docs_review', 'duty_pending', 'tdo_issued', 'in_transit', 'delivered', 'cancelled']),
  cancellation_reason: z.string().min(1, 'Cancellation reason is required when status is cancelled').optional()
});
