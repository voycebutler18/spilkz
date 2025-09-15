// src/pages/Dashboard/Bookmarks.tsx
import { useState, useEffect } from "react";
import { useSupabaseClient, useUser } from "@supabase/auth-helpers-react";
import { Database } from "@/types/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkX, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

type Supabase = Database;
type BookmarkedSplik = {
  id: string;
  splik_id: string;
  created_at: string;
  splik: {
    id: string;
    title: string | null;
    description: string | null;
    thumbnail_url: string | null;
    created_at: string;
    creator: {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    };
  };
};

export default function BookmarksPage() {
  const supabase = useSupabaseClient<Supabase>();
  const user = useUser();
  const [bookmarks, setBookmarks] = useState<BookmarkedSplik[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredBookmarks, setFilteredBookmarks] = useState<BookmarkedSplik[]>([]);

  useEffect(() => {
    if (user) {
      fetchBookmarks();
    }
  }, [user]);

  useEffect(() => {
    // Filter bookmarks based on search query
    if (searchQuery.trim()) {
      const filtered = bookmarks.filter(bookmark =>
        bookmark.splik.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bookmark.splik.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bookmark.splik.creator.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bookmark.splik.creator.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredBookmarks(filtered);
    } else {
      setFilteredBookmarks(bookmarks);
    }
  }, [searchQuery, bookmarks]);

  const fetchBookmarks = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmarks")
        .select(`
          id,
          splik_id,
          created_at,
          splik:spliks(
            id,
            title,
            description,
            thumbnail_url,
            created_at,
            creator:profiles(
              id,
              username,
              display_name,
              avatar_url
            )
          )
        `)
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBookmarks(data || []);
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
    } finally {
      setLoading(false);
    }
  };

  const removeBookmark = async (splikId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("splik_id", splikId);

      if (error) throw error;

      // Update local state
      setBookmarks(prev => prev.filter(bookmark => bookmark.splik_id !== splikId));
    } catch (error) {
      console.error("Error removing bookmark:", error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Bookmarks</h1>
        <p className="text-muted-foreground">
          Spliks you've saved to watch later
        </p>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your bookmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Badge variant="secondary" className="flex items-center gap-1">
          <Bookmark className="h-3 w-3" />
          {bookmarks.length} saved
        </Badge>
      </div>

      {/* Bookmarks Grid */}
      {filteredBookmarks.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Bookmark className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? "No bookmarks found" : "No bookmarks yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Start bookmarking spliks to save them for later"
              }
            </p>
            {!searchQuery && (
              <Link to="/home">
                <Button>Explore Spliks</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredBookmarks.map((bookmark) => (
            <Card key={bookmark.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-video relative bg-muted">
                {bookmark.splik.thumbnail_url ? (
                  <img
                    src={bookmark.splik.thumbnail_url}
                    alt={bookmark.splik.title || "Splik thumbnail"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-4xl text-muted-foreground">📹</div>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className="absolute top-2 right-2"
                  onClick={() => removeBookmark(bookmark.splik_id)}
                >
                  <BookmarkX className="h-4 w-4" />
                </Button>
              </div>

              <CardHeader className="pb-2">
                <CardTitle className="text-base line-clamp-2">
                  <Link
                    to={`/splik/${bookmark.splik_id}`}
                    className="hover:text-primary transition-colors"
                  >
                    {bookmark.splik.title || "Untitled Splik"}
                  </Link>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {bookmark.splik.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {bookmark.splik.description}
                  </p>
                )}

                {/* Creator Info */}
                <div className="flex items-center gap-2">
                  {bookmark.splik.creator.avatar_url ? (
                    <img
                      src={bookmark.splik.creator.avatar_url}
                      alt={bookmark.splik.creator.display_name || "Creator"}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                      {(bookmark.splik.creator.display_name || bookmark.splik.creator.username || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <Link
                    to={`/creator/${bookmark.splik.creator.username}`}
                    className="text-sm font-medium hover:text-primary transition-colors"
                  >
                    {bookmark.splik.creator.display_name || bookmark.splik.creator.username}
                  </Link>
                </div>

                {/* Timestamps */}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Created {formatDistanceToNow(new Date(bookmark.splik.created_at), { addSuffix: true })}
                  </span>
                  <span>
                    Saved {formatDistanceToNow(new Date(bookmark.created_at), { addSuffix: true })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
