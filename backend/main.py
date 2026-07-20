import time
import logging
import os
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from backend.schemas import PredictRequest, PredictResponse, HealthResponse, SkillPrediction
from backend.model.model_loader import load_model, is_model_loaded, predict_with_model

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("backend_main")

app = FastAPI(
    title="CandidateForge ML Model Serving Server",
    description="FastAPI service for category classification, skill extraction, and quality scoring.",
    version="1.0.0"
)

# CORS setup
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if allowed_origins_env:
    origins = [orig.strip() for orig in allowed_origins_env.split(",") if orig.strip()]
else:
    origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins + ["*"],  # Allow fallback or dynamic binding
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Trigger model loading at application startup."""
    success = load_model()
    if success:
        logger.info("FastAPI successfully loaded candidate model.")
    else:
        logger.error("FastAPI failed to load candidate model. Model endpoints will degrade to 503.")

@app.get("/")
async def root():
    """Root endpoint returning service identity."""
    return {
        "service": "CandidateForge ML Model Serving Server",
        "status": "running",
        "health_check_url": "/api/health"
    }

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint to report API status and model state."""
    model_ok = is_model_loaded()
    return HealthResponse(
        status="ok",
        model_loaded=model_ok
    )

@app.post("/api/predict", response_model=PredictResponse)
async def predict_candidate(payload: PredictRequest):
    """
    Predict endpoint that runs candidate text through the cached ML model.
    """
    start_time = time.time()
    
    # 1. Check if model is loaded
    if not is_model_loaded():
        logger.warning("Prediction requested but model is not loaded (503).")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model unavailable"
        )
        
    # 2. Run inference
    try:
        result = predict_with_model(payload.text, payload.source)
        
        # 3. Request Logging (timestamp, source, text length, duration in ms)
        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(
            f"Prediction complete | Source: {payload.source} | Text Length: {len(payload.text)} chars | "
            f"Time: {duration_ms}ms | Category: {result.get('predicted_category')}"
        )
        
        return PredictResponse(
            predicted_category=result.get("predicted_category"),
            extracted_skills=[
                SkillPrediction(name=s["name"], confidence=s["confidence"])
                for s in result.get("extracted_skills", [])
            ],
            model_confidence=result.get("model_confidence", 0.0),
            model_version=result.get("model_version", "1.0.0")
        )
        
    except Exception as err:
        logger.error(f"Prediction failed: {str(err)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference Engine Error: {str(err)}"
        )
