# MotoShop - Web-Based Auto Shop Management System

A professional, production-ready web application for managing Philippine auto repair shops. Built with React 18, TypeScript, Tailwind CSS, Supabase (PostgreSQL), and Groq AI for scalable management of appointments, inventory, customers, and intelligent diagnostics.

---

## Featured Photos

<div align="center">

![Featured Photo 1](MOTOLINK%20FEATURED%20PHOTOS/FIRST.jfif)
![Featured Photo 2](MOTOLINK%20FEATURED%20PHOTOS/SECOND.jfif)
![Featured Photo 3](MOTOLINK%20FEATURED%20PHOTOS/THIRD.jfif)

</div>



## Features

### Core Modules

#### 1. **Dashboard with Analytics** 
- Real-time revenue tracking and trends
- Job status distribution (pie charts)
- Daily metrics and KPIs
- Top parts used analytics
- Low-stock alerts with visual indicators
- Customizable time period filters (week/month/year)
- Professional dark-mode UI with Recharts visualization

#### 2. **Inventory Management** 
- **Full CRUD** for parts and components
- Real-time stock tracking with low-stock alerts
- Category filtering (brakes, tires, oils, electrical, suspension, exhaust, filters)
- Search and advanced filtering
- Visual stock level indicators
- CSV export for reports
- Part details: SKU, unit price, supplier tracking
- Reorder level configuration

#### 3. **Appointment Calendar** 
- Visual calendar interface for scheduling
- Time-slot availability system
- Appointment status tracking (Pending/Confirmed/In-Progress/Completed/Cancelled)
- Quick booking form with vehicle information
- Real-time conflict detection
- Mechanic assignment
- Note-taking for service details
- Bulk status updates

#### 4. **Customer Portal** 
- Service history with complete records
- Vehicle registration and management
- Total spending analytics
- Member since tracking
- Service record details with parts used
- Invoice download (PDF export)
- Upcoming appointment visibility

#### 5. **AI-Powered Chatbot** 
- **Context-aware assistance** based on user role
- **For Mechanics**: Diagnostic tool, part suggestions based on symptoms
- **For Customers**: Service info, FAQ, appointment booking helper
- Automatic part recommendation system
- Groq API integration with llama-3.3-70b-versatile model
- Bilingual chat support (English/Tagalog)
- Real-time chat history tracking in Supabase

#### 6. **Bilingual Interface** 
- English ↔ Tagalog toggle
- Full translation coverage for all UI elements
- Language preference persistence (localStorage)
- Context-aware language switching

### Security & Access Control

- **Role-Based Access Control (RBAC)**
  - Admin/Owner: Full system access
  - Mechanic/Staff: Job orders, inventory, customer records
  - Customer: Limited portal access
- Supabase JWT authentication
- Password-protected login with encryption
- Session management and auto-logout

### Additional Features

- **Responsive Design**: Mobile-first, works on all devices
- **Dark Mode**: Eye-friendly, modern aesthetic  
- **Real-time Database Sync**: Live updates via Supabase
- **PDF Export**: Invoices and reports
- **CSV Export**: Data backup and analysis
- **Multi-role Authentication**: Owner, Mechanic, Customer portals
- **Advanced Search & Filtering**: Find parts, appointments, customers instantly
- **Settings Management**: Per-user customizable preferences

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS, PostCSS, Autoprefixer |
| **Animations** | Framer Motion |
| **Icons** | Lucide React |
| **Charts** | Recharts, Chart.js |
| **Forms** | React Hook Form, Zod |
| **State** | React Context API |
| **AI** | Groq SDK (llama-3.3-70b-versatile) |
| **Backend** | Supabase (PostgreSQL + Auth) |
| **Deployment** | Vercel |
| **Internationalization** | React-i18n ready |

---

## Project Structure

```
src/
├── pages/                         # Full-page components
│   ├── Dashboard.tsx             # Analytics & KPIs
│   ├── InventoryPage.tsx         # Stock management
│   ├── AppointmentCalendarPage.tsx # Scheduling
│   ├── CustomerPortal.tsx        # Customer view
│   └── LoginPage.tsx             # Authentication
├── components/
│   ├── SystemNavbar.tsx          # Top navigation
│   ├── EnhancedChatbotWidget.tsx # AI assistant
│   ├── Navbar.tsx                # Landing nav
│   ├── HeroSlideshow.tsx         # Hero section
│   ├── FeaturedSection.tsx       # Product showcase
│   ├── TrustSection.tsx          # Testimonials
│   └── Footer.tsx                # Footer
├── contexts/
│   ├── AuthContext.tsx           # Authentication & authorization
│   └── LanguageContext.tsx       # i18n management
├── types/
│   └── index.ts                  # TypeScript interfaces
├── services/                      # API/Database services (Supabase integration)
├── utils/                         # Helper functions
├── hooks/                         # Custom React hooks
├── App.tsx                       # Main app router
├── main.tsx                      # Entry point
└── globals.css                   # Global styles

Other:
├── tailwind.config.ts            # Tailwind customization
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite config
└── .env.local                    # Environment variables
```

---

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- A Supabase account (free tier: supabase.com)
- Groq API key (free: console.groq.com)

### Installation

1. **Clone and Install**
```bash
cd c:\Users\Zuck\Desktop\CAPSTONE\ SYSTEM-PROJ
npm install
```

2. **Set Up Environment Variables**
Create `.env.local`:
```
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. **Start Development Server**
```bash
npm run dev
```
Open `http://localhost:5173`

4. **Build for Production**
```bash
npm run build
npm run preview
```

---

## 🗄️ Database Schema (Supabase Setup)

### Tables to Create

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  phone VARCHAR,
  role VARCHAR DEFAULT 'customer',
  shop_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Vehicles
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  make VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  year INTEGER,
  plate_number VARCHAR UNIQUE,
  engine_number VARCHAR,
  vin VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Parts (Inventory)
CREATE TABLE parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  name VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  sku VARCHAR UNIQUE NOT NULL,
  unit_price DECIMAL,
  quantity_in_stock INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  supplier_id UUID,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  vehicle_id UUID REFERENCES vehicles(id),
  shop_id UUID NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  service_type VARCHAR NOT NULL,
  description TEXT,
  mechanic_id UUID REFERENCES users(id),
  status VARCHAR DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Job Orders
CREATE TABLE job_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  mechanic_id UUID REFERENCES users(id),
  shop_id UUID NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id),
  status VARCHAR DEFAULT 'draft',
  labor_hours DECIMAL,
  labor_rate DECIMAL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Chat History
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES users(id),
  shop_id UUID,
  sender_type VARCHAR,
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID REFERENCES job_orders(id),
  customer_id UUID REFERENCES users(id),
  shop_id UUID NOT NULL,
  subtotal DECIMAL,
  tax_rate DECIMAL DEFAULT 0.12,
  tax_amount DECIMAL,
  total_amount DECIMAL,
  payment_method VARCHAR,
  payment_status VARCHAR DEFAULT 'unpaid',
  due_date DATE,
  issued_date DATE,
  paid_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Environment Setup

### Supabase Configuration

1. Go to supabase.com and create a project
2. Get your URL and anon key from Project Settings > API
3. Add to `.env.local`:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### Groq API Key

1. Visit console.groq.com
2. Create an account and generate API key
3. Add to `.env.local`:
   ```
   VITE_GROQ_API_KEY=gsk_xxxxx...
   ```

---

##Testing the System

The system uses **real Supabase authentication**. To test:

1. Create a test account via the login screen
2. Or use existing test credentials configured in your Supabase project
3. Role-based access is controlled by the database `role` field

---

## 🚢 Deployment on Vercel

### Steps:

1. **Push Code to GitHub**
```bash
git add .
git commit -m "ProductionReady: Full auto shop management system"
git push origin main
```

2. **Deploy on Vercel**
- Go to vercel.com
- Click "New Project"
- Import GitHub repository
- Add environment variables:
  - `VITE_GROQ_API_KEY`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Click Deploy

3. **Enable Auto-Deployment**
- Every push to main branch triggers auto-deployment
- Live URL: `https://your-project.vercel.app`

---

## System Status & Quality Assurance

###Implemented Core Features
- [x] User authentication with role-based access (Owner, Mechanic, Customer)
- [x] Appointment scheduling with visual calendar interface
- [x] Real-time inventory tracking and management
- [x] Comprehensive customer management system
- [x] AI-powered diagnostic chatbot (Groq integration)
- [x] Report generation (CSV/PDF export)
- [x] Bilingual interface (English/Tagalog)
- [x] Multi-user portals with role-specific dashboards
- [x] Database persistence via Supabase PostgreSQL
- [x] Service history and invoice tracking

###Quality Metrics

**Functional Completeness**
- All core business requirements implemented
- Edge cases handled with proper error boundaries  
- User-friendly error messages and validation
- Comprehensive data validation with Zod schemas

**Usability**
- Intuitive navigation with role-based dashboards
- Clear visual hierarchy and information architecture
- Fully responsive on mobile/tablet/desktop
- Bilingual support for diverse user base
- Dark mode for extended use sessions

**Reliability**
- Supabase PostgreSQL for data integrity
- Graceful fallback mechanisms for API failures
- Input validation and XSS protection via React
- Consistent error handling across all pages

**Performance**
- React 18 optimization with memoization
- Efficient state management via Context API
- Real-time data sync with minimal latency
- Optimized bundle size with proper code splitting

**Security**
- Supabase JWT-based authentication
- Row-level security policies in PostgreSQL
- Input sanitization across all forms
- HTTPS-ready deployment architecture

**Maintainability**
- TypeScript for type safety and IDE support
- Modular component architecture
- Service-based data layer abstraction
- Clear code organization and naming conventions

**Portability**
- Cross-platform (Windows/Mac/Linux)
- Cloud-ready (Vercel + Supabase)
- No platform-specific dependencies
- Works in all modern browsers

---

## 📚 Resources & Documentation

- React Documentation: https://react.dev
- Tailwind CSS: https://tailwindcss.com/docs
- Supabase Docs: https://supabase.com/docs
- Groq API: https://console.groq.com/docs
- TypeScript: https://www.typescriptlang.org/docs/
- See `SUPABASE_SETUP.md` for database configuration
- See `SYSTEM_ARCHITECTURE.md` for detailed system design

---

## Troubleshooting

### Issue: Groq API rate limited
**Solution**: Wait 60 seconds before making another request to the chatbot

### Issue: Supabase not connecting
**Solution**: Verify `.env.local` contains correct URL and anon key from Supabase dashboard

### Issue: Styles not applying
**Solution**: Run `npm run build` to rebuild Tailwind CSS, then restart dev server

### Issue: Authentication failed
**Solution**: Ensure you've created tables in Supabase using the SQL commands from SUPABASE_SETUP.md

---

## Future Enhancements

- [ ] SMS via Twilio/Semaphore API
- [ ] Email notifications  
- [ ] WhatsApp Business API integration
- [ ] Advanced analytics (machine learning predictions)
- [ ] Offline PWA support
- [ ] Multi-language expansion (10+ languages)
- [ ] Video call support for remote consultations
- [ ] Barcode/QR scanning for inventory
- [ ] Mobile native app (React Native)

---

## Support & Contribution

For issues, feature requests, or contributions:
- File an issue on the project repository
- Check existing code documentation in component files
- Refer to `SYSTEM_ARCHITECTURE.md` for system design overview
- See `SUPABASE_SETUP.md` and `AUTH_SETUP_GUIDE.md` for environment configuration

---

## License

This project is open-source and ready for deployment to production Philippine auto repair shops.

**Built for efficient auto shop management** ⚙️



**Project Version**: 2.1.0  
**Last Updated**: April 2026  
**Status**: Production-Ready ✅
