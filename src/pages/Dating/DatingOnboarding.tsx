import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Heart,
  Camera,
  Upload,
  X,
  Plus,
  Sparkles,
  ArrowRight,
  MapPin,
  User,
  Loader2,
  Play,
  Volume2,
  CheckCircle
} from 'lucide-react';

const DatingOnboardingRedesign = () => {
  const navigate = useNavigate();
  const [signupData, setSignupData] = useState(null);
  const [bio, setBio] = useState('');
  const [photos, setPhotos] = useState([]);
  const [videoIntro, setVideoIntro] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // 1: Bio, 2: Media, 3: Preview

  useEffect(() => {
    // Load signup data from previous step
    const data = localStorage.getItem('dating_signup_data');
    if (data) {
      setSignupData(JSON.parse(data));
    } else {
      // Redirect back if no signup data
      navigate('/dating');
    }
  }, [navigate]);

  const addPhoto = async (file) => {
    if (photos.length >= 6) return;
    
    setUploading(true);
    const url = URL.createObjectURL(file);
    setPhotos(prev => [...prev, { id: Date.now(), url, file }]);
    setUploading(false);
  };

  const removePhoto = (id) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const addVideoIntro = (file) => {
    const url = URL.createObjectURL(file);
    setVideoIntro({ url, file });
  };

  const removeVideoIntro = () => {
    setVideoIntro(null);
  };

  const canContinue = () => {
    switch (currentStep) {
      case 1:
        return bio.trim().length >= 20;
      case 2:
        return photos.length > 0 || videoIntro !== null;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      // Here you would normally upload to your backend
      // For now, we'll simulate the process and redirect to discover
      
      // Save all profile data
      const completeProfile = {
        ...signupData,
        bio,
        photos: photos.map(p => p.url),
        videoIntro: videoIntro?.url,
        completed_at: new Date().toISOString()
      };

      localStorage.setItem('dating_profile', JSON.stringify(completeProfile));
      
      // Simulate upload time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      navigate('/dating/discover', { replace: true });
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaving(false);
    }
  };

  const progress = (currentStep / 3) * 100;

  if (!signupData) {
    return <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="h-8 w-8 text-fuchsia-500 animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900">
      {/* Header */}
      <div className="border-b border-zinc-800/50 bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
                <Heart className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Complete Your Profile</h1>
                <p className="text-sm text-zinc-400">Step {currentStep} of 3</p>
              </div>
            </div>
            
            <div className="text-sm text-zinc-400">
              {Math.round(progress)}% complete
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-zinc-800 rounded-full h-2 mt-4">
            <div
              className="bg-gradient-to-r from-fuchsia-500 to-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {currentStep === 1 && (
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-2xl text-white flex items-center gap-2">
                    <User className="h-6 w-6" />
                    Tell us about yourself
                  </CardTitle>
                  <p className="text-zinc-400">
                    Write a bio that shows your personality and what makes you unique
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-3">
                      Your bio (minimum 20 characters)
                    </label>
                    <Textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 500))}
                      className="bg-zinc-900 border-zinc-600 text-white min-h-[150px] resize-none text-lg leading-relaxed"
                      placeholder="Share what makes you unique... your interests, what you're looking for, your sense of humor, or anything that represents the real you!"
                    />
                    <div className="flex justify-between text-sm mt-2">
                      <span className={bio.length < 20 ? 'text-red-400' : 'text-green-400'}>
                        {bio.length < 20 ? `${20 - bio.length} more characters needed` : 'Good to go!'}
                      </span>
                      <span className="text-zinc-500">{bio.length}/500</span>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-lg p-4">
                    <h4 className="text-white font-medium mb-2">💡 Bio tips:</h4>
                    <ul className="text-sm text-zinc-300 space-y-1">
                      <li>• Mention your passions and hobbies</li>
                      <li>• Share what you're looking for</li>
                      <li>• Add a touch of humor or personality</li>
                      <li>• Keep it authentic and positive</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep === 2 && (
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-2xl text-white flex items-center gap-2">
                    <Camera className="h-6 w-6" />
                    Add photos & video intro
                  </CardTitle>
                  <p className="text-zinc-400">
                    Show your best self with photos and a 3-second video intro
                  </p>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Video Intro Section */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Play className="h-5 w-5 text-fuchsia-500" />
                      3-Second Video Intro
                      <span className="ml-2 bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs px-2 py-1 rounded-full">
                        Recommended
                      </span>
                    </h3>
                    
                    {!videoIntro ? (
                      <div className="border-2 border-dashed border-fuchsia-500/50 rounded-xl p-8 text-center bg-gradient-to-br from-fuchsia-500/5 to-purple-500/5 hover:border-fuchsia-500/70 transition-colors">
                        <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Camera className="h-8 w-8 text-white" />
                        </div>
                        <h4 className="text-white font-medium mb-2">Create your 3-second intro</h4>
                        <p className="text-zinc-400 text-sm mb-4">
                          Show your personality! We'll automatically trim it to exactly 3 seconds.
                        </p>
                        <label className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg cursor-pointer transition-all">
                          <Upload className="h-4 w-4" />
                          Upload video
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && addVideoIntro(e.target.files[0])}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-20 bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-lg flex items-center justify-center overflow-hidden">
                            <video
                              src={videoIntro.url}
                              className="h-full w-full object-cover"
                              autoPlay
                              muted
                              loop
                              playsInline
                            />
                          </div>
                          <div className="flex-1">
                            <p className="text-white font-medium">Video intro ready!</p>
                            <p className="text-zinc-400 text-sm">Will be trimmed to exactly 3 seconds</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={removeVideoIntro}
                            className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Photos Section */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Camera className="h-5 w-5 text-cyan-500" />
                      Photos ({photos.length}/6)
                    </h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photos.map((photo, index) => (
                        <div key={photo.id} className="relative group">
                          <img
                            src={photo.url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-40 object-cover rounded-xl"
                          />
                          <button
                            onClick={() => removePhoto(photo.id)}
                            className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          {index === 0 && (
                            <div className="absolute top-2 left-2 bg-fuchsia-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                              Main
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {photos.length < 6 && (
                        <label className="border-2 border-dashed border-zinc-600 rounded-xl h-40 flex flex-col items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors bg-zinc-900/20">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])}
                            className="hidden"
                          />
                          {uploading ? (
                            <Loader2 className="h-8 w-8 text-fuchsia-500 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-8 w-8 text-zinc-500 mb-2" />
                              <span className="text-zinc-400 text-sm">Add photo</span>
                            </>
                          )}
                        </label>
                      )}
                    </div>
                    
                    <p className="text-zinc-500 text-sm mt-3">
                      Add at least 1 photo. Your first photo will be your main profile picture.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep === 3 && (
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-2xl text-white flex items-center gap-2">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                    Profile Preview
                  </CardTitle>
                  <p className="text-zinc-400">
                    Take a final look at your profile before going live
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-xl p-6 text-center">
                    <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">You're all set!</h3>
                    <p className="text-zinc-300 mb-6">
                      Your profile is complete and ready to start matching with amazing people nearby.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-black/20 rounded-lg p-3">
                        <div className="text-fuchsia-400 font-semibold">✓ Profile Info</div>
                        <div className="text-zinc-400">Complete</div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3">
                        <div className="text-purple-400 font-semibold">✓ Photos</div>
                        <div className="text-zinc-400">{photos.length} added</div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3">
                        <div className="text-cyan-400 font-semibold">✓ Bio</div>
                        <div className="text-zinc-400">Written</div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3">
                        <div className={videoIntro ? "text-green-400" : "text-zinc-600"}>
                          {videoIntro ? "✓" : "○"} Video Intro
                        </div>
                        <div className="text-zinc-400">
                          {videoIntro ? "Added" : "Optional"}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center mt-8">
              <Button
                variant="outline"
                onClick={() => currentStep > 1 ? setCurrentStep(prev => prev - 1) : navigate('/dating')}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                {currentStep === 1 ? 'Back to Home' : 'Previous'}
              </Button>

              <Button
                onClick={handleNext}
                disabled={!canContinue() || saving}
                className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 px-8 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Publishing...
                  </>
                ) : currentStep === 3 ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start Matching!
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Live Preview Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Live Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Profile Card Preview */}
                    <div className="bg-zinc-900 rounded-xl p-4">
                      <div className="text-center mb-4">
                        <div className="h-20 w-20 mx-auto mb-3 ring-2 ring-fuchsia-500/30 rounded-full overflow-hidden">
                          {videoIntro ? (
                            <video
                              src={videoIntro.url}
                              className="h-full w-full object-cover"
                              autoPlay
                              muted
                              loop
                              playsInline
                            />
                          ) : photos[0] ? (
                            <img
                              src={photos[0].url}
                              className="h-full w-full object-cover"
                              alt="Profile"
                            />
                          ) : (
                            <Avatar className="h-20 w-20">
