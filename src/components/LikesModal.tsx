// Temporary stub to satisfy old imports while likes are disabled.
import React from "react";

type Props = {
  isOpen?: boolean;
  onClose?: () => void;
  splikId?: string;
  onCountDelta?: (d: number) => void;
};

export default function LikesModal(_props: Props) {
  return null; // Renders nothing
}
