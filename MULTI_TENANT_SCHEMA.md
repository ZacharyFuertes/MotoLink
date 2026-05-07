# 🏗️ Multi-Tenant Database Schema & Migrations

**Status**: Ready to implement in Supabase SQL Editor  
**Scope**: Extends existing schema to support full marketplace platform  
**Backward Compatibility**: Existing data preserved; new columns/tables added

---

## 📋 Migration Plan Overview

### Phase 1: Core Shop Management (NEW TABLES)
- `shops` (NEW - enhanced existing table)
- `shop_profiles` (NEW - detailed shop info)
- `shop_services` (NEW - shop-specific services)
- `shop_mechanics` (NEW - staff management)
- `shop_availability` (NEW - operating hours/calendar)
- `shop_gallery` (NEW - photos/media)

### Phase 2: Rating & Review System (NEW TABLES)
- `shop_reviews` (NEW)
- `review_photos` (NEW)

### Phase 3: Booking & Transactions (MODIFY EXISTING)
- `bookings` (rename from appointments + enhancements)
- `booking_items` (NEW - line items for services/parts)

### Phase 4: Platform Admin (NEW TABLES)
- `shop_approval_queue` (NEW)
- `platform_settings` (NEW)
- `platform_analytics` (NEW - future use)

### Phase 5: Enhanced Features (NEW TABLES)
- `service_favorites` (NEW - customer saved services)
- `shop_favorites` (NEW - customer saved shops)

---

## 🗄️ SQL Migrations (Execute in Order)

### ✅ Phase 1: Shop Management Tables

#### Migration 1.1: Enhance `shops` Table
```sql
-- Modify existing shops table with additional fields for marketplace
ALTER TABLE shops ADD COLUMN IF NOT EXISTS (
  business_type TEXT DEFAULT 'both' CHECK (business_type IN ('motorcycle', 'auto', 'both')),
  description TEXT,
  banner_url TEXT,
  verified_at TIMESTAMP WITH TIME ZONE,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  website TEXT,
  social_media_links JSONB DEFAULT '{}',
  tax_id TEXT,
  business_license TEXT,
  average_rating DECIMAL(3, 2) DEFAULT 0.0,
  total_reviews INTEGER DEFAULT 0,
  total_bookings INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'
);

-- Add indexes for marketplace search
CREATE INDEX IF NOT EXISTS idx_shops_approval_status ON shops(approval_status);
CREATE INDEX IF NOT EXISTS idx_shops_business_type ON shops(business_type);
CREATE INDEX IF NOT EXISTS idx_shops_city_active ON shops(city, is_active);
CREATE INDEX IF NOT EXISTS idx_shops_average_rating ON shops(average_rating DESC);
CREATE INDEX IF NOT EXISTS idx_shops_location ON shops USING gist(ll_to_earth(latitude, longitude));

-- Add comment
COMMENT ON TABLE shops IS 'Multi-tenant marketplace shops with approval workflow';
```

#### Migration 1.2: Create `shop_profiles` Table
```sql
CREATE TABLE IF NOT EXISTS shop_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
  
  -- Contact Info
  primary_phone TEXT,
  secondary_phone TEXT,
  email TEXT,
  
  -- Address Details
  street_address TEXT,
  barangay TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  
  -- Operating Info
  established_year INTEGER,
  employees_count INTEGER,
  
  -- Capabilities
  accepts_walk_ins BOOLEAN DEFAULT true,
  offers_mobile_service BOOLEAN DEFAULT false,
  offers_roadside_assistance BOOLEAN DEFAULT false,
  warranty_offered TEXT,
  
  -- Policies
  cancellation_policy TEXT,
  return_policy TEXT,
  accepted_payment_methods JSONB DEFAULT '["cash", "card", "online"]',
  
  -- Certifications
  certifications JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_profiles_shop_id ON shop_profiles(shop_id);
COMMENT ON TABLE shop_profiles IS 'Detailed profile information for each shop';
```

#### Migration 1.3: Create `shop_services` Table
```sql
CREATE TABLE IF NOT EXISTS shop_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- e.g., 'oil-change', 'tire-repair', 'engine-overhaul'
  
  -- Pricing
  base_price DECIMAL(10, 2) NOT NULL,
  estimated_duration_minutes INTEGER, -- How long service typically takes
  
  -- Availability
  is_active BOOLEAN DEFAULT true,
  available_for_vehicle_types JSONB DEFAULT '["motorcycle", "auto"]',
  
  -- Inventory
  parts_used JSONB DEFAULT '[]', -- Array of {part_id, quantity}
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_services_shop_id ON shop_services(shop_id);
CREATE INDEX idx_shop_services_category ON shop_services(shop_id, category);
CREATE INDEX idx_shop_services_active ON shop_services(shop_id, is_active);
COMMENT ON TABLE shop_services IS 'Services offered by each shop with pricing and details';
```

#### Migration 1.4: Create `shop_mechanics` Table
```sql
CREATE TABLE IF NOT EXISTS shop_mechanics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  specialty TEXT, -- e.g., 'engine', 'electrical', 'suspension'
  certifications JSONB DEFAULT '[]',
  photo_url TEXT,
  
  experience_years INTEGER,
  is_available BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_mechanics_shop_id ON shop_mechanics(shop_id);
CREATE INDEX idx_shop_mechanics_user_id ON shop_mechanics(user_id);
CREATE INDEX idx_shop_mechanics_available ON shop_mechanics(shop_id, is_available);
COMMENT ON TABLE shop_mechanics IS 'Mechanics/staff working at each shop';
```

#### Migration 1.5: Create `shop_availability` Table
```sql
CREATE TABLE IF NOT EXISTS shop_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  -- Operating hours (0=Monday, 6=Sunday)
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

-- Create holidays/blackout dates table
CREATE TABLE IF NOT EXISTS shop_blackout_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  reason TEXT, -- e.g., 'Holiday', 'Maintenance', 'Event'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(shop_id, date)
);

CREATE INDEX idx_blackout_dates_shop_id ON shop_blackout_dates(shop_id);
CREATE INDEX idx_blackout_dates_date ON shop_blackout_dates(shop_id, date);
COMMENT ON TABLE shop_blackout_dates IS 'Dates when shop is closed (holidays, events, etc.)';

-- Create mechanic availability slots (daily/timely)
CREATE TABLE IF NOT EXISTS mechanic_availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id UUID NOT NULL REFERENCES shop_mechanics(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  time_slot TIME NOT NULL, -- Start time of slot
  duration_minutes INTEGER DEFAULT 60,
  is_booked BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(mechanic_id, date, time_slot)
);

CREATE INDEX idx_mechanic_slots_mechanic_id ON mechanic_availability_slots(mechanic_id);
CREATE INDEX idx_mechanic_slots_date ON mechanic_availability_slots(mechanic_id, date);
COMMENT ON TABLE mechanic_availability_slots IS 'Specific time slots available for each mechanic';
```

#### Migration 1.6: Create `shop_gallery` Table
```sql
CREATE TABLE IF NOT EXISTS shop_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false, -- Shows on card
  image_type TEXT DEFAULT 'interior' CHECK (image_type IN ('interior', 'exterior', 'equipment', 'team', 'work-sample')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_gallery_shop_id ON shop_gallery(shop_id);
CREATE INDEX idx_shop_gallery_featured ON shop_gallery(shop_id, is_featured);
COMMENT ON TABLE shop_gallery IS 'Photo gallery for shop showcase';
```

---

### ✅ Phase 2: Rating & Review System

#### Migration 2.1: Create `shop_reviews` Table
```sql
CREATE TABLE IF NOT EXISTS shop_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  
  rating_overall INTEGER NOT NULL CHECK (rating_overall >= 1 AND rating_overall <= 5),
  rating_cleanliness INTEGER CHECK (rating_cleanliness >= 1 AND rating_cleanliness <= 5),
  rating_service_quality INTEGER CHECK (rating_service_quality >= 1 AND rating_service_quality <= 5),
  rating_pricing INTEGER CHECK (rating_pricing >= 1 AND rating_pricing <= 5),
  rating_communication INTEGER CHECK (rating_communication >= 1 AND rating_communication <= 5),
  
  title TEXT,
  comment TEXT,
  is_verified_purchase BOOLEAN DEFAULT false,
  
  helpful_count INTEGER DEFAULT 0,
  unhelpful_count INTEGER DEFAULT 0,
  
  reply_from_shop TEXT,
  reply_at TIMESTAMP WITH TIME ZONE,
  
  is_visible BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shop_reviews_shop_id ON shop_reviews(shop_id);
CREATE INDEX idx_shop_reviews_customer_id ON shop_reviews(customer_id);
CREATE INDEX idx_shop_reviews_rating ON shop_reviews(shop_id, rating_overall);
COMMENT ON TABLE shop_reviews IS 'Customer reviews and ratings for shops';
```

#### Migration 2.2: Create `review_photos` Table
```sql
CREATE TABLE IF NOT EXISTS review_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES shop_reviews(id) ON DELETE CASCADE,
  
  photo_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_review_photos_review_id ON review_photos(review_id);
COMMENT ON TABLE review_photos IS 'Photos attached to customer reviews';
```

---

### ✅ Phase 3: Enhanced Booking System

#### Migration 3.1: Rename & Enhance Appointments → Bookings
```sql
-- Create new bookings table with enhanced schema
CREATE TABLE IF NOT EXISTS bookings (
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
    'completed',         -- Work done, awaiting payment
    'cancelled',
    'no_show'
  )),
  
  -- Cancellation
  cancellation_reason TEXT,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by UUID REFERENCES users(id),
  
  -- Notes & Updates
  customer_notes TEXT,
  shop_notes TEXT,
  diagnostic_notes TEXT,
  
  -- Pricing
  estimated_cost DECIMAL(10, 2),
  actual_cost DECIMAL(10, 2),
  discount_applied DECIMAL(10, 2) DEFAULT 0,
  
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
COMMENT ON TABLE bookings IS 'Customer bookings/appointments with full status tracking';
```

#### Migration 3.2: Create `booking_items` Table
```sql
CREATE TABLE IF NOT EXISTS booking_items (
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
```

---

### ✅ Phase 4: Platform Admin & Approval

#### Migration 4.1: Create `shop_approval_queue` Table
```sql
CREATE TABLE IF NOT EXISTS shop_approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  
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
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_queue_status ON shop_approval_queue(status);
CREATE INDEX idx_approval_queue_shop_id ON shop_approval_queue(shop_id);
COMMENT ON TABLE shop_approval_queue IS 'Workflow for approving new shops';
```

#### Migration 4.2: Create `platform_settings` Table
```sql
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB,
  description TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('commission_percentage', '{"amount": 10, "currency": "PHP"}', 'Platform commission per booking'),
  ('min_shop_rating', '{"value": 3.0}', 'Minimum rating for active shops'),
  ('max_free_listings', '{"value": 5}', 'Free service listings per shop'),
  ('booking_confirmation_window_hours', '{"value": 2}', 'Time shop has to confirm booking'),
  ('auto_complete_after_days', '{"value": 3}', 'Auto-complete booking if not marked done'),
  ('enable_mobile_service', '{"value": true}', 'Allow mobile service offerings'),
  ('enable_reviews', '{"value": true}', 'Enable customer reviews'),
  ('terms_version', '{"version": "1.0", "date": "2026-05-07"}', 'Current terms & conditions version')
ON CONFLICT (setting_key) DO NOTHING;

COMMENT ON TABLE platform_settings IS 'Global platform configuration settings';
```

---

### ✅ Phase 5: Enhanced Features

#### Migration 5.1: Create `service_favorites` Table
```sql
CREATE TABLE IF NOT EXISTS service_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES shop_services(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(customer_id, service_id)
);

CREATE INDEX idx_service_favorites_customer_id ON service_favorites(customer_id);
COMMENT ON TABLE service_favorites IS 'Services saved by customers for quick access';
```

#### Migration 5.2: Create `shop_favorites` Table
```sql
CREATE TABLE IF NOT EXISTS shop_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(customer_id, shop_id)
);

CREATE INDEX idx_shop_favorites_customer_id ON shop_favorites(customer_id);
COMMENT ON TABLE shop_favorites IS 'Shops saved by customers for quick access';
```

---

### ✅ Phase 6: Update RLS Policies (Row-Level Security)

#### Migration 6.1: Enable RLS on New Tables
```sql
-- Enable RLS on all new tables
ALTER TABLE shop_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_mechanics ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_blackout_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mechanic_availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_favorites ENABLE ROW LEVEL SECURITY;
```

#### Migration 6.2: RLS Policies for Shop Discovery
```sql
-- Anyone can view approved, active shops
CREATE POLICY "Anyone can view approved shops" ON shops
  FOR SELECT USING (
    approval_status = 'approved' AND is_active = true
  );

-- Shop owners can view their own shop
CREATE POLICY "Owners can view own shop" ON shops
  FOR SELECT USING (
    auth.uid() = owner_id
  );

-- Platform admins (hardcoded check needed in app) can view all shops via service function
```

#### Migration 6.3: RLS Policies for Reviews
```sql
-- Anyone can view visible reviews on approved shops
CREATE POLICY "Public can view visible reviews" ON shop_reviews
  FOR SELECT USING (
    is_visible = true AND EXISTS (
      SELECT 1 FROM shops WHERE shops.id = shop_reviews.shop_id 
      AND shops.approval_status = 'approved'
    )
  );

-- Customers can view their own reviews
CREATE POLICY "Customers can view own reviews" ON shop_reviews
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM customers WHERE customers.id = customer_id)
  );

-- Customers can create reviews for their completed bookings
CREATE POLICY "Customers can create reviews" ON shop_reviews
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT user_id FROM customers WHERE customers.id = customer_id) AND
    EXISTS (
      SELECT 1 FROM bookings 
      WHERE bookings.id = booking_id 
      AND bookings.status = 'completed'
      AND bookings.customer_id = customer_id
    )
  );
```

#### Migration 6.4: RLS Policies for Bookings
```sql
-- Customers can view their own bookings
CREATE POLICY "Customers can view own bookings" ON bookings
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM customers WHERE customers.id = customer_id)
  );

-- Shop owners/staff can view bookings for their shop
CREATE POLICY "Shop owners can view shop bookings" ON bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shops 
      WHERE shops.id = shop_id AND shops.owner_id = auth.uid()
    )
  );

-- Customers can create bookings
CREATE POLICY "Customers can create bookings" ON bookings
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT user_id FROM customers WHERE customers.id = customer_id)
  );

-- Customers can update their pending bookings
CREATE POLICY "Customers can update own bookings" ON bookings
  FOR UPDATE USING (
    auth.uid() IN (SELECT user_id FROM customers WHERE customers.id = customer_id) AND
    status = 'pending'
  )
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM customers WHERE customers.id = customer_id)
  );
```

---

## 📊 Schema Diagram (Text-Based)

```
┌─────────────────────────────────────────────────────────────────┐
│                     USERS & AUTH                                 │
└─────────────────────────────────────────────────────────────────┘
  users (id, email, name, role, shop_id, created_at)
    ├─ role: 'customer' | 'owner' | 'mechanic' | 'admin'
    └─ shop_id: Links to shops they own/work at

┌─────────────────────────────────────────────────────────────────┐
│                      SHOPS & OPERATIONS                          │
└─────────────────────────────────────────────────────────────────┘
  shops (id, owner_id, name, city, business_type, approval_status, ...)
    │
    ├─→ shop_profiles (id, shop_id, email, address, ...)
    │
    ├─→ shop_services (id, shop_id, name, price, ...)
    │
    ├─→ shop_mechanics (id, shop_id, name, specialty, ...)
    │
    ├─→ shop_availability (id, shop_id, day_of_week, hours, ...)
    │
    ├─→ shop_blackout_dates (id, shop_id, date, reason, ...)
    │
    ├─→ shop_gallery (id, shop_id, image_url, ...)
    │
    └─→ shop_approval_queue (id, shop_id, status, review_by, ...)

┌─────────────────────────────────────────────────────────────────┐
│                   MECHANICS & AVAILABILITY                       │
└─────────────────────────────────────────────────────────────────┘
  shop_mechanics (id, shop_id, user_id, name, ...)
    └─→ mechanic_availability_slots (id, mechanic_id, date, time, ...)

┌─────────────────────────────────────────────────────────────────┐
│                   CUSTOMERS & BOOKINGS                           │
└─────────────────────────────────────────────────────────────────┘
  customers (id, user_id, shop_id, vehicle_type, ...)
    ├─→ bookings (id, shop_id, customer_id, mechanic_id, status, ...)
    │    └─→ booking_items (id, booking_id, service_id, part_id, ...)
    │
    ├─→ shop_reviews (id, shop_id, customer_id, rating, comment, ...)
    │    └─→ review_photos (id, review_id, photo_url, ...)
    │
    ├─→ shop_favorites (customer_id, shop_id)
    └─→ service_favorites (customer_id, service_id)

┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM ADMIN                                │
└─────────────────────────────────────────────────────────────────┘
  platform_settings (setting_key, setting_value, ...)
  platform_analytics (future - bookings trends, revenue, etc.)
```

---

## 🔄 Data Migration Strategy (From Current to Multi-Tenant)

### Step 1: Backup Current Data
```sql
-- Create backup of current appointments before renaming
CREATE TABLE appointments_backup AS SELECT * FROM appointments;
```

### Step 2: Copy Existing Appointments → New Bookings Table
```sql
INSERT INTO bookings (
  id, shop_id, customer_id, mechanic_id, 
  title, description, booking_date, booking_start_time,
  status, created_at, updated_at
)
SELECT 
  appointments.id, 
  COALESCE(shops.id, (SELECT owner_id FROM users WHERE id = auth.uid() LIMIT 1)), -- Assign to current shop
  appointments.customer_id, 
  appointments.mechanic_id, 
  appointments.title, 
  appointments.description, 
  appointments.appointment_date::DATE, 
  COALESCE(appointments.appointment_date::TIME, '08:00:00'), 
  appointments.status, 
  appointments.created_at, 
  appointments.updated_at 
FROM appointments
JOIN customers ON appointments.customer_id = customers.id
JOIN shops ON customers.shop_id = shops.id;
```

### Step 3: Optionally Drop Old Table
```sql
-- After verification, drop old appointments table
DROP TABLE IF EXISTS appointments CASCADE;

-- Create alias view if needed for backward compatibility
CREATE VIEW appointments AS SELECT * FROM bookings;
```

---

## ✅ Validation Queries (Post-Migration)

```sql
-- Count records by shop type
SELECT business_type, COUNT(*) as count FROM shops GROUP BY business_type;

-- Check average ratings calculated correctly
SELECT shop_id, name, average_rating, total_reviews FROM shops WHERE total_reviews > 0;

-- Verify bookings distribution
SELECT status, COUNT(*) as count FROM bookings GROUP BY status;

-- Check for orphaned records
SELECT COUNT(*) FROM bookings WHERE shop_id NOT IN (SELECT id FROM shops);

-- Verify RLS is working
SELECT * FROM shops LIMIT 1; -- Should only show approved shops to public
```

---

## 🚀 Next Steps

1. **Review this schema** in detail
2. **Run migrations in Supabase SQL Editor** in order (Phase 1 → 6)
3. **Update TypeScript types** to match new schema
4. **Create new services** for shop management
5. **Implement new components** (shop registration, discovery, reviews)

