'use client';

import { TokenPasswordForm } from '../../components/token-password-form';
import { authApi } from '../../lib/api/auth';

export default function ResetPasswordPage() {
  return (
    <TokenPasswordForm
      title="Restablecer contraseña"
      intro="Elige una nueva contraseña. Por seguridad se cerrarán todas tus sesiones abiertas."
      submitLabel="Guardar contraseña"
      successText="Tu contraseña fue actualizada. Ya puedes iniciar sesión."
      onSubmit={async (token, password) => {
        await authApi.resetPassword(token, password);
      }}
    />
  );
}
