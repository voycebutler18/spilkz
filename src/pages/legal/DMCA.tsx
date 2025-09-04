import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const DMCA = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-8">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              DMCA Policy
            </CardTitle>
            <p className="text-muted-foreground mt-2">Digital Millennium Copyright Act</p>
          </CardHeader>
          <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
            <h2>1. Notification of Copyright Infringement</h2>
            <p>
              Splikz respects the intellectual property rights of others and expects users to do the same.
              In accordance with the Digital Millennium Copyright Act of 1998 ("DMCA"), we will respond expeditiously
              to claims of copyright infringement committed using the Splikz service.
            </p>

            <h2>2. DMCA Notice Requirements</h2>
            <p>To file a DMCA notice, please provide the following information:</p>
            <ul>
              <li>A physical or electronic signature of the copyright owner or authorized agent</li>
              <li>Identification of the copyrighted work claimed to have been infringed</li>
              <li>Identification of the material that is claimed to be infringing, including URL</li>
              <li>Your contact information (address, telephone number, email)</li>
              <li>A statement that you have a good faith belief that the disputed use is not authorized</li>
              <li>A statement that the information in the notification is accurate</li>
            </ul>

            <h2>3. Counter-Notification</h2>
            <p>
              If you believe that your content was wrongfully removed due to a mistake or misidentification,
              you may submit a counter-notification containing:
            </p>
            <ul>
              <li>Your physical or electronic signature</li>
              <li>Identification of the material removed and its location prior to removal</li>
              <li>A statement under penalty of perjury that you have a good faith belief the material was removed by mistake</li>
              <li>Your name, address, phone number, and consent to jurisdiction</li>
            </ul>

            <h2>4. Repeat Infringer Policy</h2>
            <p>
              Splikz will terminate user accounts that are determined to be repeat infringers.
              A repeat infringer is a user who has been notified of infringing activity more than twice.
            </p>

            <h2>5. Contact Information</h2>
            <p>DMCA notices should be sent to:</p>
            <div className="bg-muted p-4 rounded-lg mt-4">
              <p className="font-semibold">Splikz DMCA Agent</p>
              <p>Email: info@splikz.com</p>
              <p>Address: [Your Company Address]</p>
            </div>

            <h2>6. False Claims</h2>
            <p>
              Please note that under Section 512(f) of the DMCA, any person who knowingly materially misrepresents
              that material or activity is infringing may be subject to liability for damages.
            </p>

            <div className="mt-8 flex justify-center">
              <Link to="/contact">
                <Button className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  Submit DMCA Notice
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DMCA;