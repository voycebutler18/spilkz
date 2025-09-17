// src/pages/Dating/DatingDiscover.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Heart, 
  X, 
  MapPin, 
  Play, 
  Sparkles, 
  Loader2, 
  Settings,
  MessageCircle,
  Star,
  Info,
  ChevronLeft,
  Filter,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

type DatingProfile = {
  user_id: string;
  name: string;
  age: number;
  bio: string;
  photos: string[];
  video_intro_url: string | null;
  city: string | null;
  gender: string;
  distance?: number; // km away
};

const SEEKING_OPTIONS = [
  "Men",
  "Women", 
  "Non-binary folks",
  "Trans men",
  "Trans women",
  "Everyone",
];

const DatingDiscover: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<DatingProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Preferences state
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [seeking, setSeeking] = useState<string[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [maxDistance, setMaxDistance] = useState(50);
  const [ageRange, setAgeRange] = useState([18, 50]);

  // Card interaction state
  const [cardStyle, setCardStyle] = useState<any>({});
  const [isDragging, setIsDragging] = useState(false);

  // Fetch current user and their dating profile
  useEffect(() => {
    const initializeUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      
      setCurrentUser(user);

      // Check if user has dating profile
      const { data: profile, error } = await supabase
        .from('dating_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error || !profile) {
        navigate("/dating/onboarding", { replace: true });
        return;
      }

      // Load user preferences
      setSeeking(profile.seeking || []);
      setMaxDistance(profile.max_distance || 50);
      setAgeRange([profile.min_age || 18, profile.max_age || 50]);

      // Fetch potential matches
      await fetchMatches(user.id);
      setLoading(false);
    };

    initializeUser();
  }, [navigate]);

  // Fetch potential matches
  const fetchMatches = async (userId: string) => {
    try {
      // This would call your database function to get potential matches
      // For now, simulating with a direct query
      const { data, error } = await supabase
        .from('dating_profiles')
        .select('*')
        .neq('user_id', userId)
        .eq('is_active', true)
        .limit(20);

      if (error) throw error;

      // Filter out users we've already liked/passed
      const { data: previousActions } = await supabase
        .from('dating_likes')
        .select('liked_id')
        .eq('liker_id', userId);

      const actionedUserIds = previousActions?.map(a => a.liked_id) || [];
      const filteredProfiles = (data || []).filter(
        profile => !actionedUserIds.includes(profile.user_id)
      );

      setProfiles(filteredProfiles as DatingProfile[]);
    } catch (error) {
      console.error('Error fetching matches:', error);
      toast({
        title: "Error loading matches",
        description: "Please try refreshing the page.",
        variant: "destructive"
      });
    }
  };

  // Handle swipe action
  const handleAction = async (action: 'like' | 'pass') => {
    if (actionInProgress || currentIndex >= profiles.length) return;
    
    setActionInProgress(true);
    const currentProfile = profiles[currentIndex];

    try {
      // Record the action
      const { error } = await supabase
        .from('dating_likes')
        .insert({
          liker_id: currentUser.id,
          liked_id: currentProfile.user_id,
          action: action
        });

      if (error) throw error;

      // Check for mutual like
      if (action === 'like') {
        const { data: mutualLike } = await supabase
          .from('dating_likes')
          .select('id')
          .eq('liker_id', currentProfile.user_id)
          .eq('liked_id', currentUser.id)
          .eq('action', 'like')
          .single();

        if (mutualLike) {
          toast({
            title: "It's a Match! 🎉",
            description: `You and ${currentProfile.name} liked each other!`,
          });
          // Could open match modal here
        }
      }

      // Move to next profile
      setCurrentIndex(prev => prev + 1);
      setCardStyle({});
      
    } catch (error) {
      console.error('Error processing action:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again.",
        variant: "destructive"
      });
    } finally {
      setActionInProgress(false);
    }
  };

  // Handle mouse/touch events for drag gesture
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const startX = e.clientX;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const rotation = deltaX * 0.1;
      const opacity = Math.abs(deltaX) > 100 ? 0.7 : 1;
      
      setCardStyle({
        transform: `translateX(${deltaX}px) rotate(${rotation}deg)`,
        opacity: opacity,
        transition: 'none'
      });
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      setIsDragging(false);
      
      if (Math.abs(deltaX) > 100) {
        // Trigger action based on direction
        if (deltaX > 0) {
          handleAction('like');
        } else {
          handleAction('pass');
        }
      } else {
        // Snap back to center
        setCardStyle({
          transform: 'translateX(0px) rotate(0deg)',
          opacity: 1,
          transition: 'all 0.3s ease-out'
        });
      }
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Save preferences
  const savePreferences = async () => {
    if (!currentUser) return;
    setSavingPrefs(true);
    
    try {
      const { error } = await supabase
        .from('dating_profiles')
        .update({
          seeking: seeking,
          max_distance: maxDistance,
          min_age: ageRange[0],
          max_age: ageRange[1]
        })
        .eq('user_id', currentUser.id);

      if (error) throw error;
      
      setPrefsOpen(false);
      toast({
        title: "Preferences saved",
        description: "Your matching preferences have been updated.",
      });
      
      // Refresh matches with new criteria
      await fetchMatches(currentUser.id);
      setCurrentIndex(0);
      
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error saving preferences",
        description: "Please try again.",
        variant: "destructive"
      });
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="h-12 w-12 animate-spin text-fuchsia-500" />
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Finding your matches</h2>
            <p className="text-zinc-400">Looking for amazing people nearby...</p>
          </div>
        </div>
      </div>
    );
  }

  const currentProfile = profiles[currentIndex];
  const hasProfiles = currentIndex < profiles.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900">
      {/* Header */}
      <div className="border-b border-zinc-800/50 bg-black/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/dating">
                <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Discover</h1>
                <p className="text-sm text-zinc-400">
                  {hasProfiles ? `${profiles.length - currentIndex} profiles remaining` : 'All caught up!'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrefsOpen(true)}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
              
              <Link to="/dating/matches">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <Heart className="h-4 w-4 mr-2" />
                  Matches
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {!hasProfiles ? (
          // No more profiles
          <Card className="bg-black/40 border-zinc-700 backdrop-blur text-center">
            <CardContent className="p-12">
              <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Star className="h-10 w-10 text-white" />
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-4">You're all caught up!</h2>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                No more profiles match your current preferences. Try adjusting your filters or check back later for new people.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  onClick={() => setPrefsOpen(true)}
                  className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Adjust Filters
                </Button>
                
                <Link to="/dating/matches">
                  <Button 
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 w-full"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    View Matches
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Profile Card
          <div className="relative">
            <Card 
              className="bg-black/40 border-zinc-700 backdrop-blur overflow-hidden cursor-grab active:cursor-grabbing select-none"
              style={cardStyle}
              onMouseDown={handleMouseDown}
            >
              {/* Profile Image/Video */}
              <div className="relative h-[600px] bg-gradient-to-b from-zinc-800 to-zinc-900">
                {currentProfile.video_intro_url ? (
                  <>
                    <video
                      src={currentProfile.video_intro_url}
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                    <Badge className="absolute top-4 left-4 bg-gradient-to-r from-fuchsia-600 to-purple-600 border-0">
                      <Play className="h-3 w-3 mr-1" />
                      3s intro
                    </Badge>
                  </>
                ) : currentProfile.photos && currentProfile.photos.length > 0 ? (
                  <img
                    src={currentProfile.photos[0]}
                    alt={currentProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Avatar className="h-32 w-32">
                      <AvatarFallback className="text-4xl bg-zinc-800 text-zinc-300">
                        {currentProfile.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                {/* Photo indicator dots */}
                {currentProfile.photos && currentProfile.photos.length > 1 && (
                  <div className="absolute top-4 right-4 flex gap-1">
                    {currentProfile.photos.slice(0, 6).map((_, i) => (
                      <div 
                        key={i} 
                        className="w-2 h-2 rounded-full bg-white/40 backdrop-blur"
                      />
                    ))}
                  </div>
                )}

                {/* Distance badge */}
                {currentProfile.distance && (
                  <Badge 
                    variant="secondary"
                    className="absolute top-4 right-4 bg-black/60 text-white border-0 backdrop-blur"
                  >
                    <MapPin className="h-3 w-3 mr-1" />
                    {currentProfile.distance}km away
                  </Badge>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                {/* Profile info overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="text-white space-y-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-3xl font-bold">
                        {currentProfile.name}
                        <span className="text-2xl font-normal text-zinc-300 ml-2">
                          {currentProfile.age}
                        </span>
                      </h2>
                    </div>
                    
                    {currentProfile.city && (
                      <div className="flex items-center gap-1 text-zinc-300">
                        <MapPin className="h-4 w-4" />
                        <span>{currentProfile.city}</span>
                      </div>
                    )}
                    
                    {currentProfile.bio && (
                      <p className="text-white/90 text-sm leading-relaxed mt-3 line-clamp-3">
                        {currentProfile.bio}
                      </p>
                    )}
                  </div>
                </div>

                {/* Info button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute bottom-4 right-4 text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Info className="h-4 w-4" />
                </Button>
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-8 mt-6">
              <Button
                size="lg"
                onClick={() => handleAction('pass')}
                disabled={actionInProgress}
                className="h-16 w-16 rounded-full bg-white/10 border-2 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all shadow-lg"
                variant="outline"
              >
                <X className="h-8 w-8 text-red-400" />
              </Button>

              <Button
                size="lg"
                onClick={() => handleAction('like')}
                disabled={actionInProgress}
                className="h-20 w-20 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 shadow-2xl shadow-fuchsia-500/30 border-2 border-fuchsia-400/50 relative overflow-hidden"
              >
                <Heart className="h-10 w-10 text-white relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
              </Button>

              <Button
                size="lg"
                onClick={() => {/* Could add super like */}}
                className="h-16 w-16 rounded-full bg-white/10 border-2 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all shadow-lg"
                variant="outline"
              >
                <Zap className="h-8 w-8 text-blue-400" />
              </Button>
            </div>

            {/* Swipe hints */}
            <div className="flex justify-between items-center mt-6 px-4 text-sm text-zinc-500">
              <div className="flex items-center gap-1">
                <X className="h-4 w-4 text-red-400" />
                <span>Swipe left to pass</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Swipe right to like</span>
                <Heart className="h-4 w-4 text-fuchsia-400" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preferences Modal */}
      {prefsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg bg-black/90 border-zinc-700 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Match Preferences</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrefsOpen(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-6">
                {/* Looking for */}
                <div>
                  <h4 className="text-white font-medium mb-3">Looking for</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {SEEKING_OPTIONS.map((option) => (
                      <button
                        key={option}
                        onClick={() => {
                          setSeeking(prev => 
                            prev.includes(option)
                              ? prev.filter(x => x !== option)
                              : [...prev, option]
                          );
                        }}
                        className={`p-3 rounded-lg text-sm text-left transition-colors ${
                          seeking.includes(option)
                            ? 'bg-gradient-to-r from-fuchsia-600/20 to-purple-600/20 border-fuchsia-500 text-fuchsia-200 border'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600 border'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Distance */}
                <div>
                  <h4 className="text-white font-medium mb-3">
                    Maximum Distance: {maxDistance}km
                  </h4>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={maxDistance}
                    onChange={(e) => setMaxDistance(parseInt(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>

                {/* Age Range */}
                <div>
                  <h4 className="text-white font-medium mb-3">
                    Age Range: {ageRange[0]} - {ageRange[1]}
                  </h4>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs text-zinc-400">Min Age</label>
                      <input
                        type="number"
                        min="18"
                        max="100"
                        value={ageRange[0]}
                        onChange={(e) => setAgeRange([parseInt(e.target.value), ageRange[1]])}
                        className="w-full mt-1 p-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-zinc-400">Max Age</label>
                      <input
                        type="number"
                        min="18"
                        max="100"
                        value={ageRange[1]}
                        onChange={(e) => setAgeRange([ageRange[0], parseInt(e.target.value)])}
                        className="w-full mt-1 p-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <Button
                  onClick={savePreferences}
                  disabled={savingPrefs}
                  className="flex-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
                >
                  {savingPrefs ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Preferences'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPrefsOpen(false)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DatingDiscover;
