import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Shield, Heart, Users } from "lucide-react";

const Guidelines = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-8">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Community Guidelines
            </CardTitle>
            <p className="text-muted-foreground mt-2">Creating a safe and positive environment for everyone</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start space-x-4 p-4 bg-primary/10 rounded-lg">
              <Heart className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold text-lg mb-2">Be Respectful</h3>
                <p className="text-muted-foreground">
                  Treat everyone with respect. No harassment, bullying, or hate speech based on race, ethnicity,
                  national origin, religion, disability, gender, age, veteran status, or sexual orientation.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 bg-secondary/10 rounded-lg">
              <Shield className="h-6 w-6 text-secondary mt-1" />
              <div>
                <h3 className="font-semibold text-lg mb-2">Keep It Safe</h3>
                <p className="text-muted-foreground">
                  Don't share content that could harm others. This includes violence, self-harm, dangerous activities,
                  or content that sexualizes minors. Report anything that makes you feel unsafe.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 bg-primary/10 rounded-lg">
              <Users className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold text-lg mb-2">Be Authentic</h3>
                <p className="text-muted-foreground">
                  Be yourself! Don't impersonate others or spread misinformation. Share content that's genuine
                  and true to who you are. Spam and fake engagement are not allowed.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 bg-secondary/10 rounded-lg">
              <AlertCircle className="h-6 w-6 text-secondary mt-1" />
              <div>
                <h3 className="font-semibold text-lg mb-2">Respect Privacy</h3>
                <p className="text-muted-foreground">
                  Don't share private information about yourself or others. This includes addresses, phone numbers,
                  email addresses, or any other personal information without consent.
                </p>
              </div>
            </div>

            <div className="space-y-8 mt-12 border-t border-border pt-8">
              <div>
                <h2 className="text-2xl font-bold mb-4">Content Guidelines</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-primary">Allowed Content</h3>
                    <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                      <li>Creative expression and art</li>
                      <li>Educational and informative content</li>
                      <li>Entertainment and humor (appropriate for all ages)</li>
                      <li>Personal stories and experiences</li>
                      <li>Positive social commentary</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-destructive">Prohibited Content</h3>
                    <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                      <li>Nudity or sexual content</li>
                      <li>Hate speech or discrimination</li>
                      <li>Violence or graphic content</li>
                      <li>Illegal activities or substances</li>
                      <li>Spam or misleading content</li>
                      <li>Copyright infringement</li>
                      <li>Personal information of others</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-3">Enforcement</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Violations of these guidelines may result in content removal, account suspension, or permanent ban.
                  We review reports carefully and take context into account when making decisions.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-3">Reporting</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If you see content that violates our guidelines, please report it immediately.
                  We review all reports and take appropriate action. False reporting is also a violation of our guidelines.
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-3">Appeals</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If you believe your content was removed in error, you can appeal the decision through our support center.
                  We'll review your appeal and respond within 48 hours.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Guidelines;