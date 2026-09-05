# VenopAI Project

VenopAI is an engineering project realization platform.

## Architecture (Modular Monolith)

- **Client Frontend**: Next.js, React, Tailwind CSS, TypeScript (deployed to Vercel)
- **Admin Frontend**: Next.js, React, Tailwind CSS, TypeScript (deployed to Vercel)
- **Backend**: FastAPI, PostgreSQL, Redis, Celery (deployed to Render)
- **Integrations**: Razorpay (Payments), Shiprocket (Shipping), Cloudinary (Files), Resend (Email), Sentry (Monitoring)

## Local Development Setup

1. **Infrastructure**:
   ```bash
   docker-compose up -d
   ```
2. **Backend**:
   ```bash
   cd backend
   python -m venv venv
   source venv/Scripts/activate # Windows
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```
3. **Client Frontend**:
   ```bash
   cd clientfrontend
   npm install
   npm run dev
   ```
4. **Admin Frontend**:
   ```bash
   cd adminfrontend
   npm install
   npm run dev
   ```

**Current Phase**: PHASE 0 (Foundation)
