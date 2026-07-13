export const eventStatuses = ['Upcoming', 'Live', 'Developing', 'Resolved', 'Archived', 'Cancelled'];
export const eventTypes = ['Live Incident', 'Public Event', 'Community', 'Breaking News', 'Sport', 'Entertainment', 'Travel', 'Government', 'Weather', 'Business', 'Education', 'Health', 'Other'];
export const sourceTypes = ['Eyewitness', 'Official', 'Media', 'Opinion', 'Community'];

export const routes = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/events', label: 'Events', icon: 'events' },
  { path: '/vortex', label: 'Vortex', icon: 'vortex' },
  { path: '/messages', label: 'Messages', icon: 'messages', badge: 3 },
  { path: '/notifications', label: 'Notifications', icon: 'notifications', dot: true },
  { path: '/profile', label: 'Profile', icon: 'profile' },
  { path: '/bookmarks', label: 'Bookmarks', icon: 'bookmark' },
];

export const secondaryRoutes = [
  { path: '/sources', label: 'Official Sources', icon: 'brand' },
  { path: '/marketplace', label: 'Marketplace', icon: 'premium' },
];
