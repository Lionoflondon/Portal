export const eventStatuses = ['Breaking', 'Developing', 'Confirmed', 'Resolved', 'Historical'];
export const sourceTypes = ['Eyewitness', 'Official', 'Media', 'Opinion', 'Community'];

export const routes = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/events', label: 'Events', icon: 'events' },
  { path: '/vortex', label: 'Vortex', icon: 'vortex' },
  { path: '/messages', label: 'Messages', icon: 'messages', badge: 3 },
  { path: '/notifications', label: 'Notifications', icon: 'notifications', dot: true },
  { path: '/profile', label: 'Profile', icon: 'profile' },
];

export const secondaryRoutes = [
  { path: '/settings', label: 'Settings', icon: 'settings' },
  { path: '/memory', label: 'Portal+ Memory', icon: 'premium' },
  { path: '/contributors', label: 'Contributor Hub', icon: 'creator' },
  { path: '/sources', label: 'Official Sources', icon: 'brand' },
  { path: '/stewardship', label: 'Stewardship', icon: 'admin' },
];

export const events = [
  {
    name: 'France vs Morocco semi final',
    status: 'Breaking',
    summary: 'Late equaliser shifted the match and Golden Boot race. Official score confirmation pending.',
    stats: '842 reports · 14 videos · 3 official sources',
    parent: "Women's Euros",
    children: 'Golden Boot race, England final',
    live: true,
  },
  {
    name: 'London heatwave advisory',
    status: 'Developing',
    summary: 'Amber warning expanded across Greater London with transport and school impacts.',
    stats: '216 reports · 5 official sources',
    parent: 'UK summer weather',
    children: 'Transport delays, school closures',
    live: false,
  },
  {
    name: 'Apple product launch',
    status: 'Confirmed',
    summary: 'Product launch coverage connected to repairability and VisionOS update events.',
    stats: '1.2k reports · 48 videos · 9 media sources',
    parent: 'Apple launch cycle',
    children: 'iPhone repairability, VisionOS update',
    live: false,
  },
];

export const reports = [
  {
    source: 'Eyewitness',
    event: 'France vs Morocco semi final',
    body: 'Photo uploaded from the north stand after the equaliser. AI matched it to the existing match event.',
    media: true,
    time: '2m',
  },
  {
    source: 'Official',
    event: 'London heatwave advisory',
    body: 'Met Office update confirms amber warning expanded across Greater London.',
    media: false,
    time: '11m',
  },
  {
    source: 'Media',
    event: 'Apple product launch',
    body: 'Hands-on video added to the iPhone battery repairability timeline.',
    media: true,
    time: '24m',
  },
];

export const conversations = [
  {
    name: 'Maya Chen',
    handle: '@maya',
    time: '2h',
    initials: 'MC',
    body: 'That equaliser was unbelievable. I still do not understand how she found that angle.',
    replies: 42,
    likes: 904,
    shares: 31,
  },
  {
    name: 'Theo Banks',
    handle: '@theob',
    time: '4h',
    initials: 'TB',
    body: 'Apple finally listened on battery repairability. Tiny win, but I will take it.',
    replies: 31,
    likes: 402,
    shares: 22,
  },
  {
    name: 'Field Desk',
    handle: '@fielddesk',
    time: '6h',
    initials: 'FD',
    body: 'Who else is watching the live maps update? The storm front is moving faster than predicted.',
    replies: 18,
    likes: 176,
    shares: 9,
  },
];

export const constellations = [
  { name: "Women's Euros", meta: '12 connected events' },
  { name: 'London heatwave', meta: '7 connected events' },
  { name: 'Apple launch cycle', meta: '9 connected events' },
  { name: 'UK rail disruption', meta: '5 connected events' },
];

export const contributors = [
  { name: 'Maya Chen', meta: 'Eyewitness · 42 verified reports', initials: 'MC' },
  { name: 'BBC Weather', meta: 'Official · climate desk', initials: 'BW' },
  { name: 'Theo Banks', meta: 'Community · match tracker', initials: 'TB' },
];
