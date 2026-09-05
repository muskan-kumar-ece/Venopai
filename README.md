# VenopAI Project

VenopAI is an engineering project realization platform.

## Architecture (Modular Monolith)

- **Client Frontend**: Next.js, React, Tailwind CSS, TypeScript (deployed to Vercel)
- **Admin Frontend**: Next.js, React, Tailwind CSS, TypeScript (deployed to Vercel)
- **Backend**: FastAPI, PostgreSQL, Redis, Celery (deployed to Render)
- **Integrations**: Razorpay (Payments), Shiprocket (Shipping), Cloudinary (Files), Resend (Email), Sentry (Monitoring)

## Local Development Setup

> **Note**: Docker is NOT required for VenopAI development. Use native tools and remote managed instances for lightweight local development.

1. **Infrastructure Requirements**:
   - **Database**: Local native PostgreSQL installation OR managed PostgreSQL.
   - **Redis**: Upstash Redis or another lightweight remote Redis instance.
   - **Celery**: Run local Python process when workers are needed.

2. **Backend**:
   ```bash
   cd backend
   python -m venv venv
   # Activate virtual environment
   .\venv\Scripts\activate # Windows PowerShell
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


## Local Development (Phase 1)

VenopAI runs locally with three processes. You will need 3 separate terminals:

**Terminal 1: Backend**
``bash
cd backend
python -m venv venv
# activate venv
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
``

**Terminal 2: Client Frontend**
``bash
cd clientfrontend
npm install
npm run dev -p 3000
``

**Terminal 3: Admin Frontend**
``bash
cd adminfrontend
npm install
npm run dev -p 3001
``

**Prerequisites:**
- PostgreSQL running on localhost:5432
- Redis running on localhost:6379 (e.g. Upstash or native)

