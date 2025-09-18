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
        // Fetch from spliks table since that's where photos are stored
        const { data, error } = await supabase
          .from("spliks")
          .select("*")
          .eq("id", id)
          .eq("status", "active")
          .is("video_url", null) // Ensure it's a photo
          .maybeSingle();

        if (error || !data) {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!photo) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Photo not found</h1>
          <Button onClick={() => window.history.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <Button
            variant="outline"
            className="mb-6 border-gray-700 text-gray-300"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <img
              src={photo.thumbnail_url}
              alt={photo.title || "Photo"}
              className="w-full max-h-[70vh] object-contain bg-black"
            />
            
            <div className="p-6">
              {photo.title && (
                <h1 className="text-2xl font-bold text-white mb-4">{photo.title}</h1>
              )}
              
              {photo.profile && (
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={photo.profile.avatar_url} />
                    <AvatarFallback className="bg-purple-600 text-white">
                      {(photo.profile.display_name || photo.profile.username || "U").charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Link
                      to={`/creator/${photo.profile.username || photo.user_id}`}
                      className="text-white font-medium hover:text-purple-300"
                    >
                      {photo.profile.display_name || photo.profile.username || "User"}
                    </Link>
                    <p className="text-gray-400 text-sm flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(photo.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              
              {photo.description && (
                <p className="text-gray-300 leading-relaxed">{photo.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
