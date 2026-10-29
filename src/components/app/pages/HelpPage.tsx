import { useTranslation } from 'react-i18next';
import { ExternalLink, LifeBuoy, Mail, Rocket } from 'lucide-react';
import { Button } from '../../ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Card, CardContent, CardHeader, CardTitle } from '../../ui/primitives';
import { PageHeader } from '../common';
import { ManageAppsScreenshot } from '../ManageAppsScreenshot';
import { openShippingSettings, SUPPORT_EMAIL, SUPPORT_MAILTO } from '../wix-pages';

const FAQ = ['1', '6', '7', '8', '2', '9', '10', '11', '3', '12', '4', '13', '5'] as const;

export function HelpPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('help.title')} description={t('help.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="size-4" aria-hidden="true" /> {t('help.gettingStarted')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid list-decimal gap-2 ps-5 text-sm">
              {(['gs1', 'gs2', 'gs3', 'gs4', 'gs5'] as const).map((k) => (
                <li key={k}>{t(`help.${k}`)}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="size-4" aria-hidden="true" /> {t('help.support')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>{t('help.supportBody')}</p>
            <a
              className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
              href={SUPPORT_MAILTO}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Mail className="size-3.5" aria-hidden="true" /> {t('help.contactDeveloper')}: {SUPPORT_EMAIL}
            </a>
            <a
              className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
              href="https://support.wix.com/en/article/wix-stores-offering-real-time-shipping-rates-via-third-party-apps"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('help.docs')} <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('help.faq')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem value="enable">
                <AccordionTrigger>{t('help.qEnable')}</AccordionTrigger>
                <AccordionContent className="grid gap-3">
                  <p className="text-muted-foreground">{t('help.aEnable')}</p>
                  <ol className="text-muted-foreground grid list-decimal gap-1 ps-5">
                    <li>{t('checkout.step1')}</li>
                    <li>{t('checkout.step2')}</li>
                    <li>{t('checkout.step3', { app: t('common.appName') })}</li>
                    <li>{t('checkout.step4')}</li>
                    <li>{t('checkout.step5')}</li>
                  </ol>
                  <ManageAppsScreenshot />
                  <Button className="w-fit" onClick={openShippingSettings}>
                    <ExternalLink /> {t('checkout.openShippingSettings')}
                  </Button>
                </AccordionContent>
              </AccordionItem>
              {FAQ.map((n) => (
                <AccordionItem key={n} value={n}>
                  <AccordionTrigger>{t(`help.q${n}`)}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{t(`help.a${n}`)}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <p className="text-muted-foreground mt-4 text-sm">
              {t('help.stillStuck')}{' '}
              <a className="text-primary underline-offset-4 hover:underline" href={SUPPORT_MAILTO} target="_blank" rel="noopener noreferrer">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
