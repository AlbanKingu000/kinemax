import { useNavigate } from 'react-router';
import { useToast } from '../components/Toast/toast-context';
import { useMessages } from '../i18n/use-messages';
import { useAuth } from './auth-context';

/** Signs out, tells the user and goes home. */
export function useSignOut(): () => Promise<void> {
  const t = useMessages();
  const toast = useToast();
  const navigate = useNavigate();
  const { logout } = useAuth();
  return async () => {
    await logout();
    toast.show({ tone: 'info', title: t.account.loggedOut });
    void navigate('/');
  };
}
