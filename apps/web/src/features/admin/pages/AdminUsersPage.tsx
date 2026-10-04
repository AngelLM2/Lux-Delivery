import { LockKeyhole, Mail, Phone, Plus, Search, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { UserRole } from '../../../shared/api/types'
import { useDebounce } from '../../../shared/hooks/useDebounce'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { FORM_ERROR_KEY, getApiErrorMessage, getFieldErrors } from '../../../shared/lib/errors'
import { formatDateTime, formatRole } from '../../../shared/lib/formatters'
import { PASSWORD_HINT, isStrongPassword, isValidEmail } from '../../../shared/lib/validators'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { InputField } from '../../../shared/ui/Input'
import { LoadMore } from '../../../shared/ui/LoadMore'
import { SelectField } from '../../../shared/ui/Select'
import { SidePanel } from '../../../shared/ui/SidePanel'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useAuthStore } from '../../auth/store'
import { AdminPageHeader } from '../components/AdminPageHeader'
import { useCreateUser, useSetUserActive, useUserList } from '../hooks'

const ROLE_TABS: Array<{ label: string; role: UserRole | null }> = [
  { label: 'Todos', role: null },
  { label: 'Clientes', role: 'customer' },
  { label: 'Administradores', role: 'admin' },
]

const EMPTY_FORM = { full_name: '', email: '', phone: '', password: '', role: 'customer' as UserRole }

const NewUserForm = ({ onCreated }: { onCreated: () => void }) => {
  const createUser = useCreateUser()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const update = (field: keyof typeof EMPTY_FORM) => (value: string) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const clientErrors: Record<string, string> = {}
    if (form.full_name.trim().length < 2) clientErrors.full_name = 'Informe o nome completo.'
    if (!isValidEmail(form.email)) clientErrors.email = 'E-mail inválido.'
    if (!isStrongPassword(form.password)) clientErrors.password = PASSWORD_HINT
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    try {
      await createUser.mutateAsync({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password: form.password,
        role: form.role,
      })
      setForm(EMPTY_FORM)
      onCreated()
    } catch (error) {
      const fields = getFieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0 || fields[FORM_ERROR_KEY]) {
        setFormError(fields[FORM_ERROR_KEY] ?? getApiErrorMessage(error))
      }
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <InputField
        label="Nome completo"
        icon={<UserRound size={17} />}
        value={form.full_name}
        onChange={(e) => update('full_name')(e.target.value)}
        error={errors.full_name}
      />
      <InputField
        label="E-mail"
        type="email"
        icon={<Mail size={17} />}
        value={form.email}
        onChange={(e) => update('email')(e.target.value)}
        error={errors.email}
      />
      <InputField
        label="Telefone (opcional)"
        type="tel"
        icon={<Phone size={17} />}
        value={form.phone}
        onChange={(e) => update('phone')(e.target.value)}
        error={errors.phone}
      />
      <InputField
        label="Senha inicial"
        type="password"
        icon={<LockKeyhole size={17} />}
        autoComplete="new-password"
        value={form.password}
        onChange={(e) => update('password')(e.target.value)}
        error={errors.password}
      />
      <SelectField
        label="Perfil"
        value={form.role}
        onChange={update('role')}
        error={errors.role}
        options={[
          { value: 'customer', label: 'Cliente' },
          { value: 'admin', label: 'Administrador' },
        ]}
      />
      <div className="admin-form-actions">
        <Button variant="primary" type="submit" isLoading={createUser.isPending}>
          Criar usuário
        </Button>
      </div>
    </form>
  )
}

export const AdminUsersPage = () => {
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [role, setRole] = useState<UserRole | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const q = useDebounce(search.trim(), 350)
  const usersQuery = useUserList({ role, q })
  const setActive = useSetUserActive()

  usePageMeta('Usuários — Admin')

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Usuários"
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
            Novo usuário
          </Button>
        }
      />

      <section className="card admin-card admin-list-card">
        <div className="admin-toolbar">
          <div className="segmented" role="group" aria-label="Filtrar por perfil">
            {ROLE_TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                aria-pressed={tab.role === role}
                className={tab.role === role ? 'active' : ''}
                onClick={() => setRole(tab.role)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="admin-toolbar-search">
            <InputField
              label="Buscar por nome ou e-mail"
              hideLabel
              type="search"
              placeholder="Buscar por nome ou e-mail (mín. 2 letras)"
              icon={<Search size={17} />}
              maxLength={60}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {usersQuery.isPending ? (
          <div className="admin-rows">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} height={60} />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <Alert tone="danger">Não foi possível carregar os usuários.</Alert>
        ) : usersQuery.users.length === 0 ? (
          <EmptyState title="Nenhum usuário" description="Ajuste os filtros ou cadastre um novo usuário." />
        ) : (
          <ul className="admin-rows" aria-label="Usuários">
            {usersQuery.users.map((user) => {
              const isSelf = user.id === currentUserId
              const pending = setActive.isPending && setActive.variables?.id === user.id
              return (
                <li key={user.id} className={`admin-row admin-user-grid ${user.is_active ? '' : 'is-muted'}`}>
                  <span className="admin-user-cell">
                    <span className="admin-avatar" aria-hidden="true">
                      {user.full_name.charAt(0).toUpperCase()}
                    </span>
                    <span className="admin-row-main">
                      <strong>
                        {user.full_name}
                        {isSelf && <span className="caption"> (você)</span>}
                      </strong>
                      <span className="caption" title={`Último acesso: ${formatDateTime(user.last_login_at)}`}>
                        {user.email}
                      </span>
                    </span>
                  </span>
                  <span className="admin-row-cell" data-label="Perfil">
                    <Badge tone={user.role === 'admin' ? 'info' : 'neutral'}>{formatRole(user.role)}</Badge>
                  </span>
                  <span className="admin-row-cell" data-label="Status">
                    <span className={`availability ${user.is_active ? 'is-on' : 'is-danger'}`}>
                      {user.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </span>
                  <span className="admin-row-actions">
                    {user.is_active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="btn-ghost-danger"
                        disabled={isSelf}
                        title={isSelf ? 'Você não pode desativar a própria conta.' : undefined}
                        isLoading={pending}
                        onClick={() => setActive.mutate({ id: user.id, active: false })}
                      >
                        Desativar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        isLoading={pending}
                        onClick={() => setActive.mutate({ id: user.id, active: true })}
                      >
                        Reativar
                      </Button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <LoadMore
          hasNextPage={usersQuery.hasNextPage}
          isFetchingNextPage={usersQuery.isFetchingNextPage}
          onLoadMore={() => void usersQuery.fetchNextPage()}
        />
      </section>

      <SidePanel
        isOpen={creating}
        title="Novo usuário"
        description="A pessoa pode trocar a senha depois, no próprio perfil."
        onClose={() => setCreating(false)}
      >
        <NewUserForm onCreated={() => setCreating(false)} />
      </SidePanel>
    </div>
  )
}
