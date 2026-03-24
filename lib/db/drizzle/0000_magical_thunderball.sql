CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"cas_number" text,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"minimum_stock" numeric DEFAULT '0' NOT NULL,
	"maximum_stock" numeric,
	"location" text,
	"supplier" text,
	"hazard_class" text,
	"storage_conditions" text,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_records" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"record_date" date NOT NULL,
	"previous_balance" numeric DEFAULT '0' NOT NULL,
	"inputs" numeric DEFAULT '0' NOT NULL,
	"outputs" numeric DEFAULT '0' NOT NULL,
	"final_balance" numeric DEFAULT '0' NOT NULL,
	"notes" text,
	"registered_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "immobilized_products" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"quantity" numeric NOT NULL,
	"reason" text NOT NULL,
	"immobilized_date" date NOT NULL,
	"status" text DEFAULT 'immobilized' NOT NULL,
	"released_at" timestamp,
	"released_by" text,
	"notes" text,
	"registered_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samples" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"product_name" text,
	"supplier" text,
	"sample_code" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"sample_date" date NOT NULL,
	"purpose" text NOT NULL,
	"destination" text,
	"lab_reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" text,
	"notes" text,
	"taken_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "samples_sample_code_unique" UNIQUE("sample_code")
);
--> statement-breakpoint
CREATE TABLE "dye_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"lot_number" text NOT NULL,
	"quantity" numeric NOT NULL,
	"expiration_date" date,
	"receipt_date" date NOT NULL,
	"supplier" text,
	"certificate_number" text,
	"quality_status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"notes" text,
	"registered_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "final_disposition" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"product_name_manual" text,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"disposition_type" text NOT NULL,
	"disposition_date" date NOT NULL,
	"contractor" text,
	"manifest_number" text,
	"certificate_number" text,
	"cost" numeric,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"notes" text,
	"registered_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"document_type" text NOT NULL,
	"category" text,
	"description" text,
	"file_name" text,
	"file_size" text,
	"file_data" text,
	"file_url" text,
	"version" text,
	"issue_date" date,
	"expiration_date" date,
	"responsible_party" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personnel" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"name" text NOT NULL,
	"position" text NOT NULL,
	"department" text NOT NULL,
	"email" text,
	"phone" text,
	"hire_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "personnel_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "epp_checklists" (
	"id" text PRIMARY KEY NOT NULL,
	"personnel_id" text NOT NULL,
	"check_date" date NOT NULL,
	"items" text NOT NULL,
	"overall_status" text DEFAULT 'compliant' NOT NULL,
	"notes" text,
	"reviewed_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epp_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"epp_id" text NOT NULL,
	"personnel_id" text NOT NULL,
	"delivery_date" date NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"condition" text DEFAULT 'new' NOT NULL,
	"return_date" date,
	"return_condition" text,
	"notes" text,
	"delivered_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epp_master" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"standard_reference" text,
	"replacement_period_days" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epp_master_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"details" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"colorant_name" text NOT NULL,
	"usage_lot" text NOT NULL,
	"new_lot" text NOT NULL,
	"approval_date" date,
	"comments" text,
	"interpreted_status" text DEFAULT 'REVISAR' NOT NULL,
	"active" text DEFAULT 'true' NOT NULL,
	"registered_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immobilized_products" ADD CONSTRAINT "immobilized_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immobilized_products" ADD CONSTRAINT "immobilized_products_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immobilized_products" ADD CONSTRAINT "immobilized_products_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_taken_by_users_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dye_lots" ADD CONSTRAINT "dye_lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dye_lots" ADD CONSTRAINT "dye_lots_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dye_lots" ADD CONSTRAINT "dye_lots_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_disposition" ADD CONSTRAINT "final_disposition_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_disposition" ADD CONSTRAINT "final_disposition_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_disposition" ADD CONSTRAINT "final_disposition_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epp_checklists" ADD CONSTRAINT "epp_checklists_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epp_checklists" ADD CONSTRAINT "epp_checklists_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epp_deliveries" ADD CONSTRAINT "epp_deliveries_epp_id_epp_master_id_fk" FOREIGN KEY ("epp_id") REFERENCES "public"."epp_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epp_deliveries" ADD CONSTRAINT "epp_deliveries_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epp_deliveries" ADD CONSTRAINT "epp_deliveries_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_evaluations" ADD CONSTRAINT "lot_evaluations_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;