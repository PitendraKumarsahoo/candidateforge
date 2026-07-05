
import { VercelRequest, VercelResponse } from '@vercel/node';
import { predictInProcess } from '../../../../src/services/modelClient';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { text, source } = req.body;
    const prediction = predictInProcess(text, source);
    res.status(200).json(prediction);
  } catch (error: any) {
    console.error('Model API predict error:', error);
    res.status(500).json({ error: 'Failed to run model prediction.', details: error.message });
  }
}
