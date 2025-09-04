import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Mail, FileText, Image, Film, Newspaper } from "lucide-react";
import { Link } from "react-router-dom";

const Press = () => {
  const pressReleases: any[] = [];
  // Press releases will be added when available

  const mediaAssets = [
    {
      icon: <Image className="h-5 w-5" />,
      title: "Logo Package",
      description: "High-resolution logos in various formats",
      size: "2.5 MB"
    },
    {
      icon: <Film className="h-5 w-5" />,
      title: "Product Screenshots",
      description: "App interface and feature highlights",
      size: "8.3 MB"
    },
    {
      icon: <FileText className="h-5 w-5" />,
      title: "Brand Guidelines",
      description: "Official brand usage guidelines",
      size: "1.2 MB"
    }
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-6xl mx-auto py-12 px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
            Press Center
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Get the latest news, resources, and media assets for Splikz
          </p>
        </div>

        {/* About Splikz */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle>About Splikz</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
            <p>
              Splikz is the world's first 3-second gesture-based video platform, revolutionizing how people communicate
              through motion. Splikz enables users to create, share, and discover ultra-short video
              content that transcends language barriers.
            </p>
            <p>
              With our innovative amplification technology and creator-first approach, Splikz is building
              a global community of creators who communicate through gesture and motion.
            </p>
          </CardContent>
        </Card>

        {/* Press Releases */}
        {pressReleases.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold mb-6">Latest Press Releases</h2>
            <div className="space-y-4">
              {pressReleases.map((release: any, index: number) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardContent className="py-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">{release.date}</p>
                        <h3 className="font-semibold text-lg mb-1">{release.title}</h3>
                        <p className="text-muted-foreground">{release.description}</p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Newspaper className="h-4 w-4 mr-2" />
                        Read
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Media Assets */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Media Assets</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {mediaAssets.map((asset, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-primary">{asset.icon}</span>
                      <CardTitle className="text-base">{asset.title}</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{asset.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">Size: {asset.size}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Leadership */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              For leadership information and team details, please contact our press team.
            </p>
          </CardContent>
        </Card>

        {/* Press Contact */}
        <Card className="bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="py-12">
            <div className="text-center">
              <Mail className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h2 className="text-2xl font-semibold mb-2">Press Inquiries</h2>
              <p className="text-muted-foreground mb-6">
                For media inquiries, interviews, or additional resources
              </p>
              <div className="space-y-2">
                <p className="font-medium">info@splikz.com</p>
                <p className="text-sm text-muted-foreground">Response time: 24 hours</p>
              </div>
              <Link to="/contact">
                <Button className="mt-6 bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  Contact Press Team
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Press;