'use client';

import { useRouter } from 'next/navigation';
import { TokenPasswordForm } from '../../components/token-password-form';
import { authApi } from '../../lib/api/auth';

export default function AcceptInvitePage() {
  const router = useRouter();
  return (
    <TokenPasswordForm
      title="Activar tu cuenta"
      intro="Define tu contraseña. Luego configurarás la verificación en dos pasos (obligatoria)."
      submitLabel="Activar cuenta"
      successText="Cuenta activada. Redirigiendo a la configuración de verificación en dos pasos…"
      onSubmit={async (token, password) => {
        const res = await authApi.acceptInvite(token, password);
        sessionStorage.setItem('noah_setup_token', res.setupToken);
        router.replace('/setup-2fa');
      }}
    />
  );
}
