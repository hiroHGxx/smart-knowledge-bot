# SmartKnowledgeBot Deployment Instructions

## Vercel Deployment Steps

### 1. Repository Connection
- GitHub Repository: `https://github.com/hiroHGxx/smart-knowledge-bot`
- Project Path: `/skb-frontend`
- Framework: Next.js (auto-detected)

### 2. Environment Variables Setup
Navigate to Vercel Dashboard → Project Settings → Environment Variables and add:

```bash
# Required Environment Variables
GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-api-key-here
CONVEX_URL=https://your-project.convex.cloud
CONVEX_AUTH_TOKEN=your-convex-auth-token-here
NODE_ENV=production
```

### 3. Build Configuration
- Build Command: `npm run build` (default)
- Output Directory: `.next` (default)
- Install Command: `npm install` (default)
- Root Directory: `skb-frontend`

### 4. Function Configuration
- API Routes Timeout: 30 seconds (`/api/chat`)
- Database Timeout: 10 seconds (`/api/test-convex`)

### 5. Prerequisites
Before deployment, ensure these services are running:
1. **Convex Database**: `npx convex dev` in `skb-datastore/`
2. **Mastra Intelligence**: `npx mastra dev` in `skb-intelligence/`

### 6. Manual Deployment via Vercel Dashboard

1. **Import Project**:
   - Go to https://vercel.com/dashboard
   - Click "Add New..." → "Project"
   - Import from GitHub: `hiroHGxx/smart-knowledge-bot`

2. **Configure Settings**:
   - Root Directory: `skb-frontend`
   - Framework Preset: Next.js (auto-detected)
   - Build Command: `npm run build`
   - Output Directory: `.next`

3. **Add Environment Variables**:
   - Click "Environment Variables" tab
   - Add all variables from `.env.example`
   - Use actual values (not placeholders)

4. **Deploy**:
   - Click "Deploy"
   - Wait for build completion (~2-5 minutes)

### 7. Post-Deployment Testing
1. Visit the deployed URL
2. Test basic UI functionality
3. Submit test question: "装備強化の方法は？"
4. Verify RAG response with related documents

### 8. Expected Results
- **Build Time**: 2-5 minutes
- **RAG Response Time**: 8-12 seconds
- **Features Working**:
  - Question input/submission
  - Loading spinner with steps
  - Error handling with visual feedback
  - Question history (localStorage)
  - Related documents count badge
  - Professional RAG responses

## Troubleshooting

### Common Issues
1. **Build Failures**: Check environment variables
2. **API Timeouts**: Verify Convex/Mastra services running
3. **CORS Errors**: Ensure proper Next.js API routes
4. **Environment Variables**: Use production values, not dev keys

### Development vs Production
- Development: Uses `dev:` prefixed Convex keys
- Production: Uses full authentication tokens
- API Endpoints: Same structure, different authentication

### Support Resources
- Vercel Docs: https://vercel.com/docs
- Next.js Deployment: https://nextjs.org/docs/deployment
- Convex Production: https://docs.convex.dev/production

---
**Note**: This deployment guide assumes all backend services (Convex, Mastra) are properly configured and running.
