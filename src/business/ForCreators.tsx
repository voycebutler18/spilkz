import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, Users, Sparkles, TrendingUp, Video, Gift } from "lucide-react";
import { Link } from "react-router-dom";

const ForCreators = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-6xl mx-auto py-12 px-4">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
            Create. Share. Earn.
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Turn your creativity into income. Join thousands of creators making a living doing what they love.
          </p>
          <div className="mt-8">
            <Link to="/signup">
              <Button size="lg" className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                Start Creating
              </Button>
            </Link>
          </div>
        </div>

        {/* Monetization Options */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">Multiple Ways to Earn</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <DollarSign className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Creator Fund</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Get paid based on your content performance and engagement metrics.
                </p>
                <ul className="text-sm space-y-2">
                  <li>• Earn per 1000 views</li>
                  <li>• Bonus for viral content</li>
                  <li>• Monthly payouts</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Gift className="h-8 w-8 text-secondary mb-2" />
                <CardTitle>Virtual Gifts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Receive gifts from your fans that convert to real money.
                </p>
                <ul className="text-sm space-y-2">
                  <li>• Live gift receiving</li>
                  <li>• 60% revenue share</li>
                  <li>• Instant withdrawals</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Sparkles className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Brand Partnerships</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Connect with brands for sponsored content opportunities.
                </p>
                <ul className="text-sm space-y-2">
                  <li>• Direct brand deals</li>
                  <li>• Campaign participation</li>
                  <li>• Set your own rates</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Growth Tools */}
        <Card className="mb-12 bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="py-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-4">Tools for Growth</h2>
                <p className="text-muted-foreground mb-6">
                  Everything you need to grow your audience and maximize your earnings.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center">
                    <TrendingUp className="h-5 w-5 text-primary mr-2" />
                    <span>Analytics dashboard</span>
                  </li>
                  <li className="flex items-center">
                    <Users className="h-5 w-5 text-secondary mr-2" />
                    <span>Audience insights</span>
                  </li>
                  <li className="flex items-center">
                    <Video className="h-5 w-5 text-primary mr-2" />
                    <span>Content optimization tips</span>
                  </li>
                </ul>
              </div>
              <div className="bg-card p-6 rounded-lg">
                <h3 className="font-semibold mb-4">Creator Tiers</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-muted rounded">
                    <p className="font-medium text-sm">Rising Star</p>
                    <p className="text-xs text-muted-foreground">1K+ followers • Basic monetization</p>
                  </div>
                  <div className="p-3 bg-primary/20 rounded border border-primary/30">
                    <p className="font-medium text-sm">Creator</p>
                    <p className="text-xs text-muted-foreground">10K+ followers • Full monetization</p>
                  </div>
                  <div className="p-3 bg-secondary/20 rounded border border-secondary/30">
                    <p className="font-medium text-sm">Elite</p>
                    <p className="text-xs text-muted-foreground">100K+ followers • Premium features</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Join the Movement */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">Join the Creator Movement</h2>
          <Card className="bg-gradient-to-r from-primary/10 to-secondary/10">
            <CardContent className="py-8 text-center">
              <p className="text-lg text-muted-foreground mb-6">
                Be part of the next generation of content creators. Join Splikz early and grow with us as we revolutionize
                how people communicate through gesture-based video.
              </p>
              <Link to="/signup">
                <Button size="lg" className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  Become a Creator
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Benefits */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">Why Creators Love Splikz</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4">
              <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🎬</span>
              </div>
              <p className="font-medium">Quick Creation</p>
              <p className="text-sm text-muted-foreground">3 seconds = less editing</p>
            </div>
            <div className="text-center p-4">
              <div className="bg-secondary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🚀</span>
              </div>
              <p className="font-medium">Viral Potential</p>
              <p className="text-sm text-muted-foreground">Optimized for sharing</p>
            </div>
            <div className="text-center p-4">
              <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">💰</span>
              </div>
              <p className="font-medium">Better Earnings</p>
              <p className="text-sm text-muted-foreground">Higher revenue share</p>
            </div>
            <div className="text-center p-4">
              <div className="bg-secondary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🤝</span>
              </div>
              <p className="font-medium">Community</p>
              <p className="text-sm text-muted-foreground">Supportive creators</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <Card className="bg-gradient-to-r from-primary to-secondary text-white">
          <CardContent className="py-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Start Your Creator Journey</h2>
            <p className="mb-8 text-white/90">
              Join the fastest-growing creator platform and start earning today
            </p>
            <div className="flex gap-4 justify-center">
              <Link to="/signup">
                <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90">
                  Sign Up Now
                </Button>
              </Link>
              <Link to="/contact">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  Learn More
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForCreators;