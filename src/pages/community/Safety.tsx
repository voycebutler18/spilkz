import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, Lock, Eye, HelpCircle, Phone } from "lucide-react";
import { Link } from "react-router-dom";

const Safety = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-8">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Safety Center
            </CardTitle>
            <p className="text-muted-foreground mt-2">Your safety is our top priority</p>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-primary/20">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Account Security</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Use a strong, unique password</li>
                    <li>• Enable two-factor authentication</li>
                    <li>• Never share your login credentials</li>
                    <li>• Log out from shared devices</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-secondary/20">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <Eye className="h-5 w-5 text-secondary" />
                    <CardTitle className="text-lg">Privacy Controls</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Control who can see your content</li>
                    <li>• Manage your follower list</li>
                    <li>• Block unwanted users</li>
                    <li>• Report inappropriate content</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/20">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Recognize Threats</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Identify phishing attempts</li>
                    <li>• Spot fake profiles</li>
                    <li>• Recognize harassment</li>
                    <li>• Avoid scams and fraud</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-secondary/20">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <Lock className="h-5 w-5 text-secondary" />
                    <CardTitle className="text-lg">Data Protection</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• We encrypt your data</li>
                    <li>• Regular security audits</li>
                    <li>• GDPR compliant</li>
                    <li>• Transparent data practices</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-destructive" />
                Emergency Resources
              </h3>
              <div className="space-y-3 text-sm">
                <p>If you or someone you know is in immediate danger, please contact local emergency services.</p>
                <div className="space-y-2">
                  <p className="flex items-center">
                    <Phone className="h-4 w-4 mr-2" />
                    <span className="font-medium">Emergency: 911 (US)</span>
                  </p>
                  <p className="flex items-center">
                    <Phone className="h-4 w-4 mr-2" />
                    <span className="font-medium">Crisis Text Line: Text HOME to 741741</span>
                  </p>
                  <p className="flex items-center">
                    <Phone className="h-4 w-4 mr-2" />
                    <span className="font-medium">National Suicide Prevention Lifeline: 988</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <h2>Safety Tips</h2>
              <h3>For Teens</h3>
              <ul>
                <li>Think before you share - content lives forever online</li>
                <li>Keep personal information private</li>
                <li>Talk to a trusted adult if something feels wrong</li>
                <li>Use privacy settings to control your audience</li>
              </ul>

              <h3>For Parents</h3>
              <ul>
                <li>Have open conversations about online safety</li>
                <li>Learn about the platform and its features</li>
                <li>Set appropriate screen time limits</li>
                <li>Monitor your child's online activity</li>
              </ul>

              <h2>Reporting and Support</h2>
              <p>
                We take all reports seriously and investigate them thoroughly. You can report content or users
                directly through the app or contact our safety team.
              </p>

              <div className="flex gap-4 mt-6">
                <Link to="/contact">
                  <Button className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                    Report an Issue
                  </Button>
                </Link>
                <Link to="/help">
                  <Button variant="outline">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Get Help
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Safety;