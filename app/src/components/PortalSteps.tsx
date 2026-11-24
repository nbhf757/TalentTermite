import { portalForgotUrl } from '../lib/portal';

export default function PortalSteps({ portal, account }: { portal: string; account?: string | null }) {
  return (
    <ol className="small portal-steps">
      <li>Open <a href={portalForgotUrl(portal)} target="_blank" rel="noopener noreferrer">Get Login Info</a> and enter the mobile number on the account. A reset code comes by text.</li>
      <li>On the reset page, enter the account number{account ? <> (<strong>{account}</strong>)</> : ' from the text'}, the code, and a new password.</li>
      <li>Sign in and add the card under billing. Already have a login? Just sign in.</li>
    </ol>
  );
}
