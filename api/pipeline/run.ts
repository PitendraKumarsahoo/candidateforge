
import { VercelRequest, VercelResponse } from '@vercel/node';
import { runPipeline } from '../../src/pipeline/engine';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const response = await runPipeline(req.body);
    res.status(200).json(response);
  } catch (error: any) {
    console.error('Pipeline server route crashed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An internal error occurred running the candidate pipeline.',
    });
  }
}
