// South Florida's sign-in link (registered in Discord):
//   https://blueprintagencysales.io/api/tv-callback
import { handleTvCallback } from '../../lib/tv-callback-handler';

export default function handler(req, res) {
  return handleTvCallback(req, res, null);
}
