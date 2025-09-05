// lib/feed.ts - Complete feed rotation system with session-based randomization

export interface SplikWithScore {
  id: string;
  user_id: string;
  likes_count?: number;
  comments_count?: number;
  boost_score?: number;
  tag?: string;
  created_at: string;
  isBoosted?: boolean;
  isFresh?: boolean;
  // ... other splik properties
}

interface FeedOptions {
  userId?: string;
  category?: string | null;
  feedType: 'home' | 'discovery' | 'nearby';
  maxResults?: number;
}

// Generate a session-unique seed that persists during the session but changes on refresh
const getSessionSeed = (): number => {
  // Check if we already have a seed for this session
  let seed = (window as any).__feedRotationSeed;
  
  if (!seed) {
    // Generate a new seed based on current timestamp + random component
    seed = Date.now() + Math.floor(Math.random() * 10000);
    (window as any).__feedRotationSeed = seed;
  }
  
  return seed;
};

// Simple seeded random number generator for consistent shuffling within a session
const seededRandom = (seed: number): (() => number) => {
  let current = seed;
  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
};

// Shuffle array using seeded randomization
const shuffleWithSeed = <T>(array: T[], seed: number): T[] => {
  const shuffled = [...array];
  const random = seededRandom(seed);
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
};

// Apply session-based rotation to any feed
export const applySessionRotation = <T extends SplikWithScore>(
  items: T[], 
  options: FeedOptions
): T[] => {
  if (!items.length) return items;
  
  // Get session seed (same for entire session, new on refresh)
  const sessionSeed = getSessionSeed();
  
  // Add user-specific salt to make it unique per user
  const userSalt = options.userId ? options.userId.slice(-4) : '0000';
  const finalSeed = sessionSeed + parseInt(userSalt, 36);
  
  // Shuffle the items with session seed
  const shuffled = shuffleWithSeed(items, finalSeed);
  
  // Apply category filter if specified
  const filtered = options.category 
    ? shuffled.filter(item => 
        item.tag?.toLowerCase().includes(options.category!.toLowerCase())
      )
    : shuffled;
  
  // Return requested number of results
  return filtered.slice(0, options.maxResults || 30);
};

// Updated home feed with session-based rotation
export const createHomeFeed = (
  allSpliks: SplikWithScore[],
  boostedSpliks: SplikWithScore[] = [],
  options: FeedOptions
): SplikWithScore[] => {
  if (!allSpliks.length) return [];
  
  // Mark boosted content
  const markedBoosted = boostedSpliks.map(s => ({ ...s, isBoosted: true }));
  
  // Mark fresh content (last 24 hours)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const markedFresh = allSpliks.map(s => ({
    ...s,
    isFresh: new Date(s.created_at) > yesterday
  }));
  
  // Combine all content
  const allContent = [...markedBoosted, ...markedFresh];
  
  // Remove duplicates (boosted items might be in both arrays)
  const uniqueContent = allContent.filter((item, index, array) => 
    array.findIndex(i => i.id === item.id) === index
  );
  
  // Apply session-based rotation
  return applySessionRotation(uniqueContent, options);
};

// Updated discovery feed with session-based rotation
export const createDiscoveryFeed = (
  allSpliks: SplikWithScore[],
  options: FeedOptions
): SplikWithScore[] => {
  if (!allSpliks.length) return [];
  
  // Apply session-based rotation
  return applySessionRotation(allSpliks, options);
};

// Alias for backward compatibility (used in your Explore component)
export const applyDiscoveryFeedRotation = applySessionRotation;

// Force new rotation by clearing the session seed
export const forceNewRotation = (): void => {
  delete (window as any).__feedRotationSeed;
};

// Get rotation info for debugging
export const getRotationInfo = () => ({
  sessionSeed: (window as any).__feedRotationSeed || 'Not set',
  nextRotationOn: 'Page refresh'
});

// Legacy time-based rotation functions (keep for compatibility if needed)
export const createTimeBasedSeed = (intervalMinutes: number = 60): number => {
  const now = new Date();
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(now.getTime() / intervalMs);
};

// If you have existing functions in your feed.ts, keep them here as well
// and just add the new session-based functions above
