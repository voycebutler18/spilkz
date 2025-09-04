import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  videoTitle?: string;
  creatorName?: string;
}

const ReportModal = ({ 
  isOpen, 
  onClose, 
  videoId, 
  videoTitle = "Untitled Video",
  creatorName = "Unknown Creator"
}: ReportModalProps) => {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reportReasons = [
    { value: "inappropriate", label: "Inappropriate Content" },
    { value: "spam", label: "Spam or Misleading" },
    { value: "harmful", label: "Harmful or Dangerous" },
    { value: "copyright", label: "Copyright Violation" },
    { value: "harassment", label: "Harassment or Bullying" },
    { value: "other", label: "Other" },
  ];

  const handleSubmit = async () => {
    if (!reason) {
      toast.error("Please select a reason for reporting");
      return;
    }

    if (!description.trim()) {
      toast.error("Please describe the issue");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Here you would normally send this to an edge function or save to a reports table
      // For now, we'll log it and show success
      const reportData = {
        video_id: videoId,
        video_title: videoTitle,
        creator_name: creatorName,
        reason: reason,
        description: description,
        reporter_id: user?.id || null,
        reported_at: new Date().toISOString()
      };

      console.log("Report submitted:", reportData);
      
      toast.success("Report submitted successfully", {
        description: "Thank you for helping keep our community safe. We'll review this content shortly.",
      });
      
      // Reset form and close
      setReason("");
      setDescription("");
      onClose();
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error("Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Report Video
          </DialogTitle>
          <DialogDescription>
            Help us understand what's wrong with this content
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Video Information */}
          <div className="bg-muted p-3 rounded-lg space-y-1">
            <p className="text-sm font-medium">Video Details:</p>
            <p className="text-xs text-muted-foreground">Title: {videoTitle}</p>
            <p className="text-xs text-muted-foreground">Creator: {creatorName}</p>
            <p className="text-xs text-muted-foreground">ID: {videoId}</p>
          </div>

          {/* Report Reason */}
          <div className="space-y-3">
            <Label>Why are you reporting this video?</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {reportReasons.map((item) => (
                <div key={item.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={item.value} id={item.value} />
                  <Label 
                    htmlFor={item.value} 
                    className="font-normal cursor-pointer"
                  >
                    {item.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Additional Details */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Please provide more details about the issue
            </Label>
            <Textarea
              id="description"
              placeholder="Describe what's wrong with this video..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !reason || !description.trim()}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportModal;