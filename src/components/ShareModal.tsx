import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Share,
  Users,
  MessageCircle,
  Mail,
  Link,
} from "lucide-react";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  videoTitle?: string;
}

const ShareModal = ({ isOpen, onClose, videoId, videoTitle = "Check out this Splik!" }: ShareModalProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const shareUrl = `${window.location.origin}/video/${videoId}`;
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Share link has been copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive",
      });
    }
  };

  const shareOptions = [
    {
      name: "Social Share",
      icon: Users,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      color: "bg-blue-600 hover:bg-blue-700",
    },
    {
      name: "Quick Share", 
      icon: Share,
      url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(videoTitle)}`,
      color: "bg-sky-500 hover:bg-sky-600",
    },
    {
      name: "Message",
      icon: MessageCircle,
      action: () => {
        // Use SMS on mobile or copy to clipboard for desktop
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
          window.location.href = `sms:?body=${encodeURIComponent(videoTitle + " " + shareUrl)}`;
        } else {
          // Copy and show toast for desktop
          navigator.clipboard.writeText(`${videoTitle} ${shareUrl}`);
          toast({
            title: "Link copied for messaging!",
            description: "You can now paste this in any messaging app",
          });
        }
      },
      color: "bg-green-600 hover:bg-green-700",
    },
    {
      name: "Email",
      icon: Mail,
      url: `mailto:?subject=${encodeURIComponent(videoTitle)}&body=${encodeURIComponent("Check out this video: " + shareUrl)}`,
      color: "bg-gray-600 hover:bg-gray-700",
    },
  ];

  const handleShare = (url: string) => {
    window.open(url, "_blank", "width=600,height=400");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this Splik</DialogTitle>
          <DialogDescription>
            Share this video with your friends and followers
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Share buttons */}
          <div className="grid grid-cols-2 gap-3">
            {shareOptions.map((option) => {
              const Icon = option.icon;
              return (
                <Button
                  key={option.name}
                  onClick={() => option.action ? option.action() : handleShare(option.url!)}
                  className={`${option.color} text-white`}
                  variant="default"
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {option.name}
                </Button>
              );
            })}
          </div>

          {/* Copy link */}
          <div className="flex items-center space-x-2">
            <Input
              value={shareUrl}
              readOnly
              className="flex-1"
            />
            <Button
              onClick={handleCopy}
              variant={copied ? "secondary" : "default"}
            >
              {copied ? (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;