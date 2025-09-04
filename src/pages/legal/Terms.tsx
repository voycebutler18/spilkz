import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Terms = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-8">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Terms of Service
            </CardTitle>
            <p className="text-muted-foreground mt-2">Last updated: {new Date().toLocaleDateString()}</p>
          </CardHeader>
          <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using Splikz, you accept and agree to be bound by the terms and provision of this agreement.
              If you do not agree to abide by the above, please do not use this service.
            </p>

            <h2>2. Use License</h2>
            <p>
              Permission is granted to temporarily use Splikz for personal, non-commercial transitory viewing only.
              This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul>
              <li>Modify or copy the materials</li>
              <li>Use the materials for any commercial purpose or for any public display</li>
              <li>Attempt to reverse engineer any software contained on Splikz</li>
              <li>Remove any copyright or other proprietary notations from the materials</li>
            </ul>

            <h2>3. User Content</h2>
            <p>
              Users are solely responsible for the content they upload. Content must not violate our Community Guidelines.
              Splikz reserves the right to remove any content that violates these terms.
            </p>

            <h2>4. Privacy Policy</h2>
            <p>
              Your use of our Service is also governed by our Privacy Policy. Please review our Privacy Policy,
              which also governs the Site and informs users of our data collection practices.
            </p>

            <h2>5. Prohibited Uses</h2>
            <p>You may not use Splikz:</p>
            <ul>
              <li>For any unlawful purpose</li>
              <li>To solicit others to perform unlawful acts</li>
              <li>To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances</li>
              <li>To infringe upon or violate our intellectual property rights or the intellectual property rights of others</li>
              <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
              <li>To submit false or misleading information</li>
            </ul>

            <h2>6. Disclaimer</h2>
            <p>
              The materials on Splikz are provided "as is". Splikz makes no warranties, expressed or implied,
              and hereby disclaims and negates all other warranties including, without limitation,
              implied warranties or conditions of merchantability, fitness for a particular purpose,
              or non-infringement of intellectual property or other violation of rights.
            </p>

            <h2>7. Limitations</h2>
            <p>
              In no event shall Splikz or its suppliers be liable for any damages (including, without limitation,
              damages for loss of data or profit, or due to business interruption) arising out of the use or
              inability to use Splikz, even if Splikz or a Splikz authorized representative has been notified
              orally or in writing of the possibility of such damage.
            </p>

            <h2>8. Contact Information</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at info@splikz.com
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Terms;