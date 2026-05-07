-- ============================================================================
-- MOTOLINK MULTI-TENANT MARKETPLACE DATABASE SCHEMA
-- Complete SQL Setup for Fresh Database
-- ============================================================================
-- Created: May 7, 2026
-- Purpose: Full marketplace platform supporting multiple repair shops
-- Execute: Run this entire script in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PHASE 0: INITIAL SETUP & EXTENSIONS
-- ============================================================================

-- Enable earthdistance extension for location-based queries (optional)
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- ============================================================================
-- PHASE 1: ENHANCED USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'owner', 'mechanic', 'admin')),
  shop_id UUID,
  phone TEXT,
  address TEXT,
  profile_picture_url TEXT,
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'tl')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_shop_id ON users(shop_id);
COMMENT ON TABLE users IS 'User accounts with roles and profile information';

-- ============================================================================
-- PHASE 2: SHOPS & CORE MULTI-TENANT DATA
-- ============================================================================

CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Basic Info
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT,
  
  -- Location
  street_address TEXT NOT NULL,
  barangay TEXT,
  city TEXT NOT NULL,
  province TEXT,
  postal_code TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Business Type
  business_type TEXT NOT NULL DEFAULT 'both' CHECK (business_type IN ('motorcycle', 'auto', 'both')),
  
  -- Media
  logo_url TEXT,
  banner_url TEXT,
  
  -- Verification & Status
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    approval_status IN ('pending', 'approved', 'rejected', 'suspended')
  ),
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_code TEXT,
  
  -- Credentials
  tax_id TEXT,
  business_license TEXT,
  
  -- Social & Links
  social_media_links JSONB DEFAULT '{}',
  
  -- Stats
  average_rating DECIMAL(3, 2) DEFAULT 0.0,
  total_reviews INTEGER DEFAULT 0,
  total_bookings INTEGER DEFAULT 0,
  cancellation_rate DECIMAL(5, 2) DEFAULT 0.0,
  
  -- Settings
  is_active BOOLEAN DEFAULT true,
  accepts_walk_ins BOOLEAN DEFAULT true,
  offers_mobile_service BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shops_owner_id ON shops(owner_id);
CREATE INDEX idx_shops_city ON shops(city);
CREATE INDEX idx_shops_approval_status ON shops(approval_status);
CREATE INDEX idx_shops_business_type ON shops(business_type);
CREATE INDEX idx_shops_city_active ON shops(city, is_active);
CREATE INDEX idx_shops_average_rating ON shops(average_rating DESC);
CREATE INDEX idx_shops_slug ON shops(slug);
COMMENT ON TABLE shops IS 'Multi-tenant marketplace shops with approval workflow';

-- ============================================================================
-- SHOP PROFILES & DETAILS
-- ============================================================================

CREATE TABLE shop_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
  
  -- Contact
  primary_phone TEXT,
  secondary_phone TEXT,
  email TEXT,
  
  -- Address Details
  street_address TEXT,
  barangay TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  
  -- Business Info
  established_year INTEGER CHECK (established_year >= 1950 AND established_year <= EXTRACT(YEAR FROM NOW())),
  employees_count INTEGER,
  
  -- Service Capabilities
  accepts_walk_ins BOOLEAN DEFAULT true,
  offers_mobile_service BOOLEAN DEFAULT false,
  offers_roadside_assistance BOOLEAN DEFAULT false,
  warranty_offered TEXT,
  
  -- Policies
  cancellation_policy TEXT,
  return_policy TEXT,
  warranty_policy TEXT,
  accepted_payment_methods JSONB DEFAULT '["cash", "card", "online"]',
  
  -- Certifications
  certifications JSONB DEFAULT '[]',
  
  -- Additional Info
  bio TEXT,
  special_services TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_profiles_shop_id ON shop_profiles(shop_id);
COMMENT ON TABLE shop_profiles IS 'Detailed profile information for each shop';

-- ============================================================================
-- SHOP SERVICES
-- ============================================================================

CREATE TABLE shop_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  -- Service Details
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  
  -- Pricing
  base_price DECIMAL(10, 2) NOT NULL,
  min_price DECIMAL(10, 2),
  max_price DECIMAL(10, 2),
  currency TEXT DEFAULT 'PHP',
  
  -- Duration
  estimated_duration_minutes INTEGER,
  
  -- Availability
  is_active BOOLEAN DEFAULT true,
  available_for_vehicle_types JSONB DEFAULT '["motorcycle", "auto"]',
  
  -- Inventory
  parts_used JSONB DEFAULT '[]',
  
  -- Stats
  booking_count INTEGER DEFAULT 0,
  
  -- Display
  display_order INTEGER DEFAULT 0,
  image_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_services_shop_id ON shop_services(shop_id);
CREATE INDEX idx_shop_services_category ON shop_services(shop_id, category);
CREATE INDEX idx_shop_services_active ON shop_services(shop_id, is_active);
COMMENT ON TABLE shop_services IS 'Services offered by each shop with pricing and details';

-- ============================================================================
-- SHOP MECHANICS/STAFF
-- ============================================================================

CREATE TABLE shop_mechanics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Personal Info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialty TEXT,
  bio TEXT,
  
  -- Qualifications
  certifications JSONB DEFAULT '[]',
  experience_years INTEGER,
  
  -- Media
  photo_url TEXT,
  
  -- Status
  is_available BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  
  -- Stats
  jobs_completed INTEGER DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0.0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_mechanics_shop_id ON shop_mechanics(shop_id);
CREATE INDEX idx_shop_mechanics_user_id ON shop_mechanics(user_id);
CREATE INDEX idx_shop_mechanics_available ON shop_mechanics(shop_id, is_available);
COMMENT ON TABLE shop_mechanics IS 'Mechanics/staff working at each shop';

-- ============================================================================
-- SHOP HOURS & AVAILABILITY
-- ============================================================================

CREATE TABLE shop_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  -- Operating Hours (0=Monday, 6=Sunday)
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(shop_id, day_of_week)
);

CREATE INDEX idx_shop_availability_shop_id ON shop_availability(shop_id);
COMMENT ON TABLE shop_availability IS 'Operating hours for each shop (recurring weekly schedule)';

-- ============================================================================
-- SHOP BLACKOUT DATES (HOLIDAYS, MAINTENANCE, ETC)
-- ============================================================================

CREATE TABLE shop_blackout_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(shop_id, date_from, date_to)
);

CREATE INDEX idx_blackout_dates_shop_id ON shop_blackout_dates(shop_id);
CREATE INDEX idx_blackout_dates_date ON shop_blackout_dates(shop_id, date_from);
COMMENT ON TABLE shop_blackout_dates IS 'Date ranges when shop is closed';

-- ============================================================================
-- MECHANIC AVAILABILITY SLOTS
-- ============================================================================

CREATE TABLE mechanic_availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id UUID NOT NULL REFERENCES shop_mechanics(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  time_slot TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  is_booked BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(mechanic_id, date, time_slot)
);

CREATE INDEX idx_mechanic_slots_mechanic_id ON mechanic_availability_slots(mechanic_id);
CREATE INDEX idx_mechanic_slots_date ON mechanic_availability_slots(mechanic_id, date);
COMMENT ON TABLE mechanic_availability_slots IS 'Specific time slots available for each mechanic';

-- ============================================================================
-- SHOP GALLERY
-- ============================================================================

CREATE TABLE shop_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  image_type TEXT DEFAULT 'interior' CHECK (
    image_type IN ('interior', 'exterior', 'equipment', 'team', 'work-sample')
  ),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_gallery_shop_id ON shop_gallery(shop_id);
CREATE INDEX idx_shop_gallery_featured ON shop_gallery(shop_id, is_featured);
COMMENT ON TABLE shop_gallery IS 'Photo gallery for shop showcase';

-- ============================================================================
-- SHOP APPROVAL QUEUE
-- ============================================================================

CREATE TABLE shop_approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'needs_revision')
  ),
  
  -- Submission Info
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  submitted_by UUID NOT NULL REFERENCES users(id),
  
  -- Review Info
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  review_comments TEXT,
  rejection_reason TEXT,
  
  -- Compliance Checks
  documents_verified BOOLEAN DEFAULT false,
  business_license_verified BOOLEAN DEFAULT false,
  owner_identity_verified BOOLEAN DEFAULT false,
  contact_verified BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_queue_status ON shop_approval_queue(status);
CREATE INDEX idx_approval_queue_shop_id ON shop_approval_queue(shop_id);
COMMENT ON TABLE shop_approval_queue IS 'Workflow for approving new shops';

-- ============================================================================
-- CUSTOMERS
-- ============================================================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  phone TEXT,
  address TEXT,
  city TEXT,
  
  -- Profile Info
  preferred_shops JSONB DEFAULT '[]',
  preferred_mechanics JSONB DEFAULT '[]',
  
  -- Stats
  total_spent DECIMAL(12, 2) DEFAULT 0,
  total_bookings INTEGER DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0.0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_user_id ON customers(user_id);
COMMENT ON TABLE customers IS 'Customer profiles linked to users';

-- ============================================================================
-- CUSTOMER VEHICLES
-- ============================================================================

CREATE TABLE customer_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('motorcycle', 'auto')),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year TEXT,
  color TEXT,
  plate_number TEXT,
  chassis_number TEXT,
  engine_number TEXT,
  
  mileage INTEGER,
  
  is_primary BOOLEAN DEFAULT false,
  nickname TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_vehicles_customer_id ON customer_vehicles(customer_id);
COMMENT ON TABLE customer_vehicles IS 'Vehicles owned by customers';

-- ============================================================================
-- PARTS/INVENTORY
-- ============================================================================

CREATE TABLE parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  -- Part Details
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  
  -- Inventory
  quantity_in_stock INTEGER DEFAULT 0,
  min_stock_level INTEGER DEFAULT 5,
  reorder_quantity INTEGER DEFAULT 10,
  
  -- Pricing
  unit_price DECIMAL(10, 2) NOT NULL,
  cost_price DECIMAL(10, 2),
  currency TEXT DEFAULT 'PHP',
  
  -- Supplier Info
  supplier_name TEXT,
  supplier_contact TEXT,
  supplier_code TEXT,
  
  -- Compatibility
  compatible_vehicles JSONB DEFAULT '[]',
  compatible_services JSONB DEFAULT '[]',
  
  -- Info
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parts_shop_id ON parts(shop_id);
CREATE INDEX idx_parts_sku ON parts(shop_id, sku);
CREATE INDEX idx_parts_category ON parts(shop_id, category);
COMMENT ON TABLE parts IS 'Parts/inventory managed by each shop';

-- ============================================================================
-- BOOKINGS/APPOINTMENTS
-- ============================================================================

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  mechanic_id UUID REFERENCES shop_mechanics(id) ON DELETE SET NULL,
  
  -- Service Details
  service_id UUID REFERENCES shop_services(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Appointment Timing
  booking_date DATE NOT NULL,
  booking_start_time TIME NOT NULL,
  booking_end_time TIME,
  estimated_duration_minutes INTEGER,
  
  -- Vehicle Info
  vehicle_id UUID REFERENCES customer_vehicles(id) ON DELETE SET NULL,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year TEXT,
  vehicle_plate TEXT,
  vehicle_mileage INTEGER,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- Awaiting shop confirmation
    'confirmed',         -- Shop accepted
    'in_progress',       -- Work started
    'completed',         -- Work done
    'cancelled',
    'no_show'
  )),
  
  -- Cancellation
  cancellation_reason TEXT,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by UUID REFERENCES users(id),
  
  -- Notes
  customer_notes TEXT,
  shop_notes TEXT,
  diagnostic_notes TEXT,
  
  -- Pricing
  estimated_cost DECIMAL(10, 2),
  actual_cost DECIMAL(10, 2),
  discount_applied DECIMAL(10, 2) DEFAULT 0,
  final_amount_due DECIMAL(10, 2),
  
  -- Timeline
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookings_shop_id ON bookings(shop_id);
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_mechanic_id ON bookings(mechanic_id);
CREATE INDEX idx_bookings_status ON bookings(shop_id, status);
CREATE INDEX idx_bookings_date ON bookings(shop_id, booking_date);
CREATE INDEX idx_bookings_customer_date ON bookings(customer_id, booking_date DESC);
CREATE INDEX idx_bookings_vehicle_id ON bookings(vehicle_id);
COMMENT ON TABLE bookings IS 'Customer bookings/appointments with full status tracking';

-- ============================================================================
-- BOOKING ITEMS (LINE ITEMS FOR SERVICES/PARTS)
-- ============================================================================

CREATE TABLE booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  
  item_type TEXT NOT NULL CHECK (item_type IN ('service', 'part', 'labor')),
  
  -- Reference to service or part
  service_id UUID REFERENCES shop_services(id) ON DELETE SET NULL,
  part_id UUID REFERENCES parts(id) ON DELETE SET NULL,
  
  description TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10, 2),
  total_price DECIMAL(10, 2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_booking_items_booking_id ON booking_items(booking_id);
COMMENT ON TABLE booking_items IS 'Line items (services/parts) for each booking';

-- ============================================================================
-- JOB ORDERS (FOR MECHANICS)
-- ============================================================================

CREATE TABLE job_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  mechanic_id UUID REFERENCES shop_mechanics(id) ON DELETE SET NULL,
  
  -- Job Details
  title TEXT NOT NULL,
  description TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'assigned', 'in_progress', 'completed', 'billed', 'cancelled'
  )),
  
  -- Parts & Labor
  parts_used JSONB DEFAULT '[]',
  estimated_cost DECIMAL(10, 2),
  actual_cost DECIMAL(10, 2),
  labor_cost DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),
  
  -- Timeline
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_orders_shop_id ON job_orders(shop_id);
CREATE INDEX idx_job_orders_customer_id ON job_orders(customer_id);
CREATE INDEX idx_job_orders_mechanic_id ON job_orders(mechanic_id);
CREATE INDEX idx_job_orders_booking_id ON job_orders(booking_id);
COMMENT ON TABLE job_orders IS 'Job orders for mechanics with tracking';

-- ============================================================================
-- REVIEWS & RATINGS
-- ============================================================================

CREATE TABLE shop_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  
  -- Ratings (1-5 scale)
  rating_overall INTEGER NOT NULL CHECK (rating_overall >= 1 AND rating_overall <= 5),
  rating_cleanliness INTEGER CHECK (rating_cleanliness >= 1 AND rating_cleanliness <= 5),
  rating_service_quality INTEGER CHECK (rating_service_quality >= 1 AND rating_service_quality <= 5),
  rating_pricing INTEGER CHECK (rating_pricing >= 1 AND rating_pricing <= 5),
  rating_communication INTEGER CHECK (rating_communication >= 1 AND rating_communication <= 5),
  rating_timeliness INTEGER CHECK (rating_timeliness >= 1 AND rating_timeliness <= 5),
  
  -- Review Content
  title TEXT,
  comment TEXT,
  is_verified_purchase BOOLEAN DEFAULT false,
  
  -- Engagement
  helpful_count INTEGER DEFAULT 0,
  unhelpful_count INTEGER DEFAULT 0,
  
  -- Shop Response
  reply_from_shop TEXT,
  reply_at TIMESTAMP WITH TIME ZONE,
  
  -- Visibility
  is_visible BOOLEAN DEFAULT true,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_reviews_shop_id ON shop_reviews(shop_id);
CREATE INDEX idx_shop_reviews_customer_id ON shop_reviews(customer_id);
CREATE INDEX idx_shop_reviews_rating ON shop_reviews(shop_id, rating_overall);
CREATE INDEX idx_shop_reviews_visible ON shop_reviews(shop_id, is_visible);
COMMENT ON TABLE shop_reviews IS 'Customer reviews and ratings for shops';

-- ============================================================================
-- REVIEW PHOTOS
-- ============================================================================

CREATE TABLE review_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES shop_reviews(id) ON DELETE CASCADE,
  
  photo_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_review_photos_review_id ON review_photos(review_id);
COMMENT ON TABLE review_photos IS 'Photos attached to customer reviews';

-- ============================================================================
-- MECHANIC REVIEWS
-- ============================================================================

CREATE TABLE mechanic_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id UUID NOT NULL REFERENCES shop_mechanics(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_verified_purchase BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mechanic_reviews_mechanic_id ON mechanic_reviews(mechanic_id);
COMMENT ON TABLE mechanic_reviews IS 'Customer reviews for individual mechanics';

-- ============================================================================
-- FAVORITES
-- ============================================================================

CREATE TABLE shop_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(customer_id, shop_id)
);

CREATE INDEX idx_shop_favorites_customer_id ON shop_favorites(customer_id);
COMMENT ON TABLE shop_favorites IS 'Shops saved by customers for quick access';

CREATE TABLE service_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES shop_services(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(customer_id, service_id)
);

CREATE INDEX idx_service_favorites_customer_id ON service_favorites(customer_id);
COMMENT ON TABLE service_favorites IS 'Services saved by customers';

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL CHECK (type IN (
    'booking_confirmed', 'booking_cancelled', 'booking_reminder',
    'review_received', 'reply_received', 'shop_approved',
    'shop_message', 'special_offer', 'system'
  )),
  
  title TEXT NOT NULL,
  message TEXT,
  related_id UUID,
  related_type TEXT,
  
  is_read BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  
  -- Delivery
  sent_via_email BOOLEAN DEFAULT false,
  sent_via_sms BOOLEAN DEFAULT false,
  sent_via_push BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
COMMENT ON TABLE notifications IS 'User notifications for platform events';

-- ============================================================================
-- MESSAGES (SHOP-CUSTOMER COMMUNICATION)
-- ============================================================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  
  from_id UUID NOT NULL REFERENCES users(id),
  to_id UUID NOT NULL REFERENCES users(id),
  
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
  attachment_url TEXT,
  
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_from_id ON messages(from_id);
CREATE INDEX idx_messages_to_id ON messages(to_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
COMMENT ON TABLE messages IS 'Direct messages between customers and shops';

-- ============================================================================
-- PLATFORM ADMIN SETTINGS
-- ============================================================================

CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB,
  description TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('commission_percentage', '{"amount": 10, "currency": "PHP"}', 'Platform commission percentage per booking')
  ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('min_shop_rating', '{"value": 3.0}', 'Minimum rating for active shops')
  ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('max_free_listings', '{"value": 5}', 'Free service listings per shop')
  ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('booking_confirmation_window_hours', '{"value": 2}', 'Hours shop has to confirm booking')
  ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('auto_complete_after_days', '{"value": 3}', 'Auto-complete booking if not marked done')
  ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('enable_mobile_service', '{"value": true}', 'Enable mobile service offerings')
  ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('enable_reviews', '{"value": true}', 'Enable customer reviews')
  ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('terms_version', '{"version": "1.0", "date": "2026-05-07"}', 'Current terms and conditions version')
  ON CONFLICT (setting_key) DO NOTHING;

COMMENT ON TABLE platform_settings IS 'Global platform configuration settings';

-- ============================================================================
-- ANALYTICS & REPORTING
-- ============================================================================

CREATE TABLE platform_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Shop Analytics
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  
  -- Booking Stats
  bookings_total INTEGER DEFAULT 0,
  bookings_completed INTEGER DEFAULT 0,
  bookings_cancelled INTEGER DEFAULT 0,
  booking_cancellation_rate DECIMAL(5, 2) DEFAULT 0.0,
  
  -- Revenue
  revenue_total DECIMAL(12, 2) DEFAULT 0,
  revenue_from_platform DECIMAL(12, 2) DEFAULT 0,
  
  -- Customer Stats
  unique_customers INTEGER DEFAULT 0,
  repeat_customers INTEGER DEFAULT 0,
  
  -- Review Stats
  average_rating DECIMAL(3, 2) DEFAULT 0.0,
  total_reviews INTEGER DEFAULT 0,
  
  -- Time Period
  date_from DATE,
  date_to DATE,
  period_type TEXT CHECK (period_type IN ('daily', 'weekly', 'monthly', 'yearly')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_shop_id ON platform_analytics(shop_id);
CREATE INDEX idx_analytics_period ON platform_analytics(date_from, date_to);
COMMENT ON TABLE platform_analytics IS 'Analytics and reporting data for platform and shops';

-- ============================================================================
-- PHASE 3: ENABLE ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_mechanics ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_blackout_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mechanic_availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mechanic_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_analytics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 4: ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- ===== SHOP DISCOVERY (PUBLIC) =====
CREATE POLICY "Anyone can view approved shops" ON shops
  FOR SELECT USING (
    approval_status = 'approved' AND is_active = true
  );

CREATE POLICY "Shop owners can view own shop" ON shops
  FOR SELECT USING (
    auth.uid() = owner_id
  );

-- ===== SHOP PROFILES =====
CREATE POLICY "Anyone can view approved shop profiles" ON shop_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = shop_profiles.shop_id 
      AND shops.approval_status = 'approved' 
      AND shops.is_active = true
    )
  );

CREATE POLICY "Shop owners can view own profile" ON shop_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = shop_profiles.shop_id 
      AND shops.owner_id = auth.uid()
    )
  );

-- ===== SHOP SERVICES =====
CREATE POLICY "Anyone can view services from approved shops" ON shop_services
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = shop_services.shop_id 
      AND shops.approval_status = 'approved' 
      AND shops.is_active = true
    ) AND shop_services.is_active = true
  );

CREATE POLICY "Shop owners can manage own services" ON shop_services
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = shop_services.shop_id 
      AND shops.owner_id = auth.uid()
    )
  );

-- ===== SHOP MECHANICS =====
CREATE POLICY "Anyone can view mechanics from approved shops" ON shop_mechanics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = shop_mechanics.shop_id 
      AND shops.approval_status = 'approved' 
      AND shops.is_active = true
    ) AND shop_mechanics.is_active = true
  );

CREATE POLICY "Shop owners can manage own mechanics" ON shop_mechanics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = shop_mechanics.shop_id 
      AND shops.owner_id = auth.uid()
    )
  );

-- ===== REVIEWS (PUBLIC) =====
CREATE POLICY "Public can view visible reviews" ON shop_reviews
  FOR SELECT USING (
    is_visible = true AND 
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = shop_reviews.shop_id 
      AND shops.approval_status = 'approved'
    )
  );

CREATE POLICY "Customers can view own reviews" ON shop_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = shop_reviews.customer_id 
      AND customers.user_id = auth.uid()
    )
  );

CREATE POLICY "Customers can create reviews" ON shop_reviews
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_id 
      AND customers.user_id = auth.uid()
    )
  );

-- ===== BOOKINGS =====
CREATE POLICY "Customers can view own bookings" ON bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = bookings.customer_id 
      AND customers.user_id = auth.uid()
    )
  );

CREATE POLICY "Shop staff can view shop bookings" ON bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = bookings.shop_id 
      AND shops.owner_id = auth.uid()
    )
  );

CREATE POLICY "Customers can create bookings" ON bookings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_id 
      AND customers.user_id = auth.uid()
    )
  );

-- ===== NOTIFICATIONS =====
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (
    auth.uid() = user_id
  );

CREATE POLICY "Users can create own notifications" ON notifications
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

-- ============================================================================
-- PHASE 5: HELPFUL VIEWS FOR QUERIES
-- ============================================================================

-- View: Shop Statistics
CREATE OR REPLACE VIEW shop_statistics AS
SELECT 
  s.id,
  s.name,
  s.city,
  COUNT(DISTINCT b.id) as total_bookings,
  COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_bookings,
  AVG(sr.rating_overall) as average_rating,
  COUNT(DISTINCT sr.id) as total_reviews,
  s.created_at
FROM shops s
LEFT JOIN bookings b ON s.id = b.shop_id
LEFT JOIN shop_reviews sr ON s.id = sr.shop_id AND sr.is_visible = true
WHERE s.approval_status = 'approved' AND s.is_active = true
GROUP BY s.id, s.name, s.city, s.created_at;

-- View: Available Shops by City & Service
CREATE OR REPLACE VIEW available_shops_by_service AS
SELECT DISTINCT
  s.id,
  s.name,
  s.city,
  s.average_rating,
  s.total_reviews,
  ss.id as service_id,
  ss.name as service_name,
  ss.category as service_category,
  ss.base_price,
  s.latitude,
  s.longitude
FROM shops s
JOIN shop_services ss ON s.id = ss.shop_id
WHERE s.approval_status = 'approved' 
AND s.is_active = true 
AND ss.is_active = true;

-- ============================================================================
-- PHASE 6: FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================================

-- Function: Update shop average rating
CREATE OR REPLACE FUNCTION update_shop_average_rating(shop_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shops 
  SET 
    average_rating = COALESCE((
      SELECT AVG(rating_overall)::DECIMAL(3,2)
      FROM shop_reviews
      WHERE shop_id = shop_uuid AND is_visible = true
    ), 0),
    total_reviews = (
      SELECT COUNT(*)
      FROM shop_reviews
      WHERE shop_id = shop_uuid AND is_visible = true
    )
  WHERE id = shop_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function: Update mechanic average rating
CREATE OR REPLACE FUNCTION update_mechanic_average_rating(mechanic_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shop_mechanics 
  SET average_rating = COALESCE((
    SELECT AVG(rating)::DECIMAL(3,2)
    FROM mechanic_reviews
    WHERE mechanic_id = mechanic_uuid
  ), 0)
  WHERE id = mechanic_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function: Get available time slots for a mechanic
CREATE OR REPLACE FUNCTION get_mechanic_available_slots(
  mechanic_uuid UUID, 
  start_date DATE,
  end_date DATE
)
RETURNS TABLE(date DATE, time_slot TIME, duration_minutes INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mas.date,
    mas.time_slot,
    mas.duration_minutes
  FROM mechanic_availability_slots mas
  WHERE mas.mechanic_id = mechanic_uuid
  AND mas.date BETWEEN start_date AND end_date
  AND mas.is_booked = false
  ORDER BY mas.date, mas.time_slot;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PHASE 7: CREATE TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Trigger: Auto-update shop stats when review is added/hidden
CREATE OR REPLACE FUNCTION trigger_update_shop_review_stats()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_shop_average_rating(NEW.shop_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_shop_review_change
AFTER INSERT OR UPDATE ON shop_reviews
FOR EACH ROW
EXECUTE FUNCTION trigger_update_shop_review_stats();

-- Trigger: Auto-update mechanic stats when review is added
CREATE OR REPLACE FUNCTION trigger_update_mechanic_review_stats()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_mechanic_average_rating(NEW.mechanic_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_mechanic_review_change
AFTER INSERT ON mechanic_reviews
FOR EACH ROW
EXECUTE FUNCTION trigger_update_mechanic_review_stats();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify installation
SELECT COUNT(*) as table_count FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Summary of created tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
