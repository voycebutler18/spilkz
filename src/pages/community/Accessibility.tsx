import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Ear, Hand, Brain, Keyboard, Monitor } from "lucide-react";

const Accessibility = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-8">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Accessibility
            </CardTitle>
            <p className="text-muted-foreground mt-2">Making Splikz accessible to everyone</p>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-lg">
                At Splikz, we believe everyone should be able to express themselves through motion.
                We're committed to making our platform accessible to users of all abilities.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-primary/20">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <Eye className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Visual Accessibility</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• High contrast mode support</li>
                    <li>• Adjustable text size</li>
                    <li>• Screen reader compatibility</li>
                    <li>• Alt text for all images</li>
                    <li>• Clear visual hierarchy</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-secondary/20">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <Ear className="h-5 w-5 text-secondary" />
                    <CardTitle className="text-lg">Hearing Accessibility</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Captions for all videos</li>
                    <li>• Visual indicators for sounds</li>
                    <li>• Transcript availability</li>
                    <li>• Volume controls</li>
                    <li>• Visual notifications</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/20">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <Hand className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Motor Accessibility</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Large touch targets</li>
                    <li>• Gesture alternatives</li>
                    <li>• Keyboard navigation</li>
                    <li>• Voice control support</li>
                    <li>• Adjustable timing</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-secondary/20">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <Brain className="h-5 w-5 text-secondary" />
                    <CardTitle className="text-lg">Cognitive Accessibility</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Simple, clear language</li>
                    <li>• Consistent navigation</li>
                    <li>• Error prevention</li>
                    <li>• Clear instructions</li>
                    <li>• Predictable functionality</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="bg-muted p-6 rounded-lg">
              <h3 className="font-semibold text-lg mb-3 flex items-center">
                <Keyboard className="h-5 w-5 mr-2" />
                Keyboard Shortcuts
              </h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium mb-2">Navigation</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><kbd>Tab</kbd> - Navigate forward</li>
                    <li><kbd>Shift + Tab</kbd> - Navigate backward</li>
                    <li><kbd>Enter</kbd> - Activate element</li>
                    <li><kbd>Esc</kbd> - Close dialogs</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-2">Video Controls</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><kbd>Space</kbd> - Play/Pause</li>
                    <li><kbd>M</kbd> - Mute/Unmute</li>
                    <li><kbd>C</kbd> - Toggle captions</li>
                    <li><kbd>F</kbd> - Fullscreen</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-primary/10 p-6 rounded-lg">
              <h3 className="font-semibold text-lg mb-3 flex items-center">
                <Monitor className="h-5 w-5 mr-2" />
                Assistive Technology Support
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Splikz is compatible with the following assistive technologies:
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• NVDA (Windows)</li>
                <li>• JAWS (Windows)</li>
                <li>• VoiceOver (macOS/iOS)</li>
                <li>• TalkBack (Android)</li>
                <li>• Dragon NaturallySpeaking</li>
                <li>• Switch Control</li>
              </ul>
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <h2>Feedback and Support</h2>
              <p>
                We're constantly working to improve accessibility on Splikz. If you encounter any barriers
                or have suggestions for improvement, please contact our accessibility team at info@splikz.com
              </p>

              <h2>Compliance</h2>
              <p>
                We strive to meet or exceed the following standards:
              </p>
              <ul>
                <li>WCAG 2.1 Level AA</li>
                <li>Section 508 (US)</li>
                <li>EN 301 549 (EU)</li>
                <li>ADA compliance</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Accessibility;