// Each office's own sign-in link (register the one you need in Discord), e.g.
//   https://blueprintagencysales.io/api/tv-callback/dallas
import { handleTvCallback } from '../../../lib/tv-callback-handler';

export default function handler(req, res) {
  return handleTvCallback(req, res, String(req.query.office || ''));
}
