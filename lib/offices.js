// lib/offices.js — one entry per office TV. Role names must match Discord exactly.
//
//   memberRole  agents who appear on that office's leaderboard
//   viewerRole  the Discord account allowed to sign the TV in
//   callbackPath the Discord redirect for that office's TV sign-in (add it in Discord)
//   celebration 'cash'  = $100 bill rain + /public sound file
//               'video' = full-screen /public video with the headline + agent card

export const OFFICES = {
  'south-florida': {
    path: '/floridatv',
    callbackPath: '/api/tv-callback',            // https://blueprintagencysales.io/api/tv-callback
    title: 'South Florida Office',
    eyebrow: 'The Blueprint Agency',
    memberRole: 'South Florida Office',
    viewerRole: 'South Florida Leaderboard',
    logos: ['blueprint'],
    celebration: 'cash',
    soundUrl: '/sale.mp3',
    testHotkey: false,     // true = press T on the TV to preview a sale
  },
  dallas: {
    path: '/dallastv',
    callbackPath: '/api/tv-callback/dallas',     // https://blueprintagencysales.io/api/tv-callback/dallas
    title: 'Dallas Office',
    eyebrow: 'Blueprint × The Foundation',
    memberRole: 'Dallas Office',
    viewerRole: 'Dallas Office Leaderboard',
    logos: ['blueprint', 'foundation'],
    celebration: 'video',
    videoUrl: '/dallas-sale.mp4',
    city: 'Dallas',
    testHotkey: true,      // press T on the TV to preview a sale
  },
};

export const DEFAULT_OFFICE = 'south-florida';
export const officeOf = key => OFFICES[key] ? key : DEFAULT_OFFICE;
