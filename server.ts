import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { runPipeline } from './src/pipeline/engine';
import { predictInProcess } from './src/services/modelClient';
import { getHiringDecision } from './src/services/qwenAgent';

async function startServer() {
  const app = express();
  const port = process.env.FC_SERVER_PORT || process.env.PORT || 9000;

  // Set limits higher to support large base64 file uploads (PDF/DOCX)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Pipeline Execution Endpoint
  app.post('/api/pipeline/run', async (req, res) => {
    try {
      const response = await runPipeline(req.body);
      res.json(response);
    } catch (error: any) {
      console.error("Pipeline server route crashed:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An internal error occurred running the candidate pipeline."
      });
    }
  });

  // HireFlow Screening Agent Decision Endpoint
  app.post('/api/agent/screen', async (req, res) => {
    try {
      const { resumeText, jobDescription, mlScore } = req.body;
      if (!resumeText) {
        return res.status(400).json({ error: "Missing resumeText" });
      }
      const decision = await getHiringDecision(resumeText, jobDescription || "", Number(mlScore || 0));
      res.json(decision);
    } catch (error: any) {
      console.error("Error in HireFlow agent screening endpoint:", error);
      res.status(500).json({
        error: "Failed to obtain hiring decision from screening agent.",
        details: error.message
      });
    }
  });

  // Integrated Model API Endpoint
  app.get('/api/proxy/model/api/health', (req, res) => {
    res.json({ status: 'ok', model_loaded: true });
  });

  app.post('/api/proxy/model/api/predict', (req, res) => {
    try {
      const { text, source } = req.body;
      const prediction = predictInProcess(text, source);
      res.json(prediction);
    } catch (err: any) {
      console.error("Model API predict error:", err);
      res.status(500).json({ error: "Failed to run model prediction.", details: err.message });
    }
  });

  // Handle other relative calls as well
  app.get('/api/proxy/model/health', (req, res) => {
    res.json({ status: 'ok', model_loaded: true });
  });

  app.post('/api/proxy/model/predict', (req, res) => {
    try {
      const { text, source } = req.body;
      const prediction = predictInProcess(text, source);
      res.json(prediction);
    } catch (err: any) {
      console.error("Model API predict error:", err);
      res.status(500).json({ error: "Failed to run model prediction.", details: err.message });
    }
  });

  // Vite development server / production static asset routing
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
