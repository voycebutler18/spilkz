// src/pages/PhotoPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Calendar } from "lucide-react";

export default function PhotoPage() {
  const { id } = useParams<{ id: string }>();
  const [photo, setPhoto] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    
    const fetchPhoto = async () => {
      setLoading(true);
      try {
        // Fetch from spliks table - photos have video_url as null but thumbnail_url as the photo
        const { data, error } = await supabase
          .from("spliks")
          .select("*")
          .eq("id", id)
          .eq("status", "active")
          .maybeSingle();

        if (error || !data) {
          console.error("Photo fetch error:", error);
          setPhoto(null);
          return;
        }

        // Check if this is actually a photo (has thumbnail_url but no video_url)
        if (data.video_url !== null) {
          console.log("This is a video, not a photo");
          setPhoto(null);
          return;
        }

        // Fetch creator profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, first_name, last_name, avatar_url")
          .eq("id", data.user_id)
          .maybeSingle();

        setPhoto({ ...data, profile });
      } catch (e) {
        console.error("Error fetching photo:", e);
        setPhoto(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPhoto();
  }, [id]);

  const getCreatorName = (profile: any) => {
    if (!profile) return "User";
    const full = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    return profile.display_name?.trim() || full || profile.username?.trim() || "User";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (!photo) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Photo not found</h1>
          <p className="text-gray-400 mb-6">The photo you're looking for doesn't exist or may have been removed.</p>
          <Button 
            onClick={() => window.history.back()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const creatorName = getCreatorName(photo.profile);

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-900 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <Button
            variant="outline"
            className="mb-6 border-gray-600 text-gray-300 hover:bg-gray-800"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="bg-gray-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Photo Display */}
            <div className="relative bg-black">
              <img
                src={photo.thumbnail_url}
                alt={photo.title || photo.description || "Photo"}
                className="w-full max-h-[80vh] object-contain"
                style={{ minHeight: '400px' }}
              />
            </div>
            
            {/* Photo Info */}
            <div className="p-8">
              {/* Title */}
              {photo.title && (
                <h1 className="text-3xl font-bold text-white mb-6">{photo.title}</h1>
              )}
              
              {/* Creator Info */}
              {photo.profile && (
                <div className="flex items-center gap-4 mb-6 p-4 bg-gray-700 rounded-xl">
                  <Avatar className="w-16 h-16 ring-2 ring-purple-500">
                    <AvatarImage src={photo.profile.avatar_url} />
                    <AvatarFallback className="bg-purple-600 text-white text-xl font-bold">
                      {creatorName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Link
                      to={`/creator/${photo.profile.username || photo.user_id}`}
                      className="text-white font-bold text-lg hover:text-purple-300 transition-colors"
                    >
                      {creatorName}
                    </Link>
                    {photo.profile.username && (
                      <p className="text-gray-400">@{photo.profile.username}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(photo.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric"
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Description */}
              {photo.description && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Description</h3>
                  <p className="text-gray-300 leading-relaxed text-lg">{photo.description}</p>
                </div>
              )}

              {/* Additional Info */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Details</h3>
                  <div className="space-y-2 text-gray-300">
                    <p><span className="text-gray-500">Posted:</span> {new Date(photo.created_at).toLocaleDateString()}</p>
                    {photo.mime_type && (
                      <p><span className="text-gray-500">Type:</span> {photo.mime_type}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
