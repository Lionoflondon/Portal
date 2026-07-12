export const eventStatuses = ['Breaking', 'Developing', 'Confirmed', 'Resolved', 'Historic'];
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
  { path: '/sources', label: 'Official Sources', icon: 'brand' },
  { path: '/marketplace', label: 'Marketplace', icon: 'premium' },
];
