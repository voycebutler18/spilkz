// lib/feed.ts - Enhanced with dynamic rotation utilities

export interface RotationOptions {
  userId?: string | null;
  category?: string | null;
  feedType?: 'home' | 'discovery' | 'nearby';
  maxResults?: number;
}

export interface SplikWithScore extends Record<string, any> {
  id: string;
  created_at: string;
  likes_count?: number;
  comments_count?: number;
  boost_score?: number;
  tag?: string;
  user_id: string;
  rotationScore?: number;
  discoveryScore?: number;
}

/**
 * Hash a string to create a consistent numeric seed
 */
export const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

/**
 * Generate seeded random number for consistent rotation
 */
export const seededRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

/**
 * Create time-based seed that changes at different intervals
 */
export const createTimeSeed = (interval: 'hour' | 'halfHour' | 'day' | 'week' = 'hour'): number => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentWeek = Math.floor(now.getDate() / 7);

  switch (interval) {
    case 'halfHour':
      const currentHalfHour = Math.floor(now.getMinutes() / 30);
      return currentHalfHour + (currentHour * 2) + (currentDay * 48);
    
    case 'day':
      return currentDay + (currentMonth * 31);
    
    case 'week':
      return currentWeek + (currentMonth * 4);
    
    case 'hour':
    default:
      return currentHour + (currentDay * 24);
  }
};

/**
 * Apply rotation algorithm optimized for home feed
 */
export const applyHomeFeedRotation = (
  spliks: SplikWithScore[], 
  options: RotationOptions = {}
): SplikWithScore[] => {
  const { userId, maxResults = 40 } = options;
  
  if (!spliks.length) return [];

  const userSeed = userId ? hashString(userId) : 0;
  const timeSeed = createTimeSeed('hour');
  const combinedSeed = userSeed + timeSeed;

  const weightedSpliks = spliks.map((splik, index) => {
    const ageInHours = (Date.now() - new Date(splik.created_at).getTime()) / (1000 * 60 * 60);
    
    const recencyScore = Math.max(0, 100 - ageInHours);
    const engagementScore = (splik.likes_count || 0) + (splik.comments_count || 0) * 2;
    const randomFactor = seededRandom(combinedSeed + index) * 60;
    const boostFactor = splik.boost_score || 0;
    
    return {
      ...splik,
      rotationScore: recencyScore + engagementScore + randomFactor + boostFactor
    };
  });

  return weightedSpliks
    .sort((a, b) => b.rotationScore! - a.rotationScore!)
    .slice(0, maxResults);
};

/**
 * Apply rotation algorithm optimized for discovery feed
 */
export const applyDiscoveryFeedRotation = (
  spliks: SplikWithScore[], 
  options: RotationOptions = {}
): SplikWithScore[] => {
  const { userId, category, maxResults = 50 } = options;
  
  if (!spliks.length) return [];

  const userSeed = userId ? hashString(userId) : 0;
  const categorySeed = category ? hashString(category) : 0;
  const timeSeed = createTimeSeed('halfHour');
  const combinedSeed = userSeed + categorySeed + timeSeed;

  const weightedSpliks = spliks.map((splik, index) => {
    const ageInHours = (Date.now() - new Date(splik.created_at).getTime()) / (1000 * 60 * 60);
    
    const diversityScore = seededRandom(combinedSeed + index + hashString(splik.id)) * 80;
    const engagementScore = (splik.likes_count || 0) + (splik.comments_count || 0) * 1.5;
    const recencyBonus = ageInHours < 24 ? 20 : ageInHours < 168 ? 10 : 0;
    const categoryMatch = category && splik.tag?.toLowerCase().includes(category) ? 30 : 0;
    
    return {
      ...splik,
      discoveryScore: diversityScore + engagementScore + recencyBonus + categoryMatch
    };
  });

  return weightedSpliks
    .sort((a, b) => b.discoveryScore! - a.discoveryScore!)
    .slice(0, maxResults);
};

/**
 * Separate fresh content from older content
 */
export const separateFreshContent = (
  spliks: SplikWithScore[], 
  freshHours: number = 3
): { fresh: SplikWithScore[], older: SplikWithScore[] } => {
  const cutoffTime = new Date(Date.now() - freshHours * 60 * 60 * 1000).toISOString();
  
  const fresh = spliks
    .filter(s => s.created_at >= cutoffTime)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  
  const older = spliks
    .filter(s => s.created_at < cutoffTime);
  
  return { fresh, older };
};

/**
 * Mix boosted content into regular feed
 */
export const mixBoostedContent = (
  regularContent: SplikWithScore[],
  boostedContent: SplikWithScore[],
  interval: number = 4
): SplikWithScore[] => {
  const finalFeed: SplikWithScore[] = [];
  let boostedIndex = 0;

  regularContent.forEach((splik, index) => {
    finalFeed.push(splik);
    
    if ((index + 1) % interval === 0 && boostedIndex < boostedContent.length) {
      finalFeed.push({
        ...boostedContent[boostedIndex],
        isBoosted: true
      });
      boostedIndex++;
    }
  });

  return finalFeed;
};

/**
 * Create complete home feed with rotation logic
 */
export const createHomeFeed = (
  allSpliks: SplikWithScore[],
  boostedSpliks: SplikWithScore[],
  options: RotationOptions = {}
): SplikWithScore[] => {
  const { fresh, older } = separateFreshContent(allSpliks);
  
  const rotatedOlder = applyHomeFeedRotation(older, options);
  const markedFresh = fresh.map(splik => ({ ...splik, isFresh: true }));
  const mixedContent = mixBoostedContent(rotatedOlder, boostedSpliks);
  
  return [...markedFresh, ...mixedContent];
};

/**
 * Create complete discovery feed with rotation logic
 */
export const createDiscoveryFeed = (
  allSpliks: SplikWithScore[],
  options: RotationOptions = {}
): SplikWithScore[] => {
  return applyDiscoveryFeedRotation(allSpliks, options);
};
