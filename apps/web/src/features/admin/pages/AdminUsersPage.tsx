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
import { InputField, SelectField } from '../../../shared/ui/Input'
import { LoadMore } from '../../../shared/ui/LoadMore'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useAuthStore } from '../../auth/store'
import { useCreateUser, useSetUserActive, useUserList } from '../hooks'

const ROLE_TABS: Array<{ label: string; role: UserRole | null }> = [
  { label: 'Todos', role: null },
  { label: 'Clientes', role: 'customer' },
  { label: 'Administradores', role: 'admin' },
]

const EMPTY_FORM = { full_name: '', email: '', phone: '', password: '', role: 'customer' as UserRole }

const NewUserForm = () => {
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
    } catch (error) {
      const fields = getFieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0 || fields[FORM_ERROR_KEY]) {
        setFormError(fields[FORM_ERROR_KEY] ?? getApiErrorMessage(error))
      }
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <h3 className="h3" style={{ margin: 0 }}>Novo usuário</h3>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <InputField label="Nome completo" value={form.full_name} onChange={(e) => update('full_name')(e.target.value)} error={errors.full_name} />
      <InputField label="E-mail" type="email" value={form.email} onChange={(e) => update('email')(e.target.value)} error={errors.email} />
      <InputField label="Telefone (opcional)" type="tel" value={form.phone} onChange={(e) => update('phone')(e.target.value)} error={errors.phone} />
      <InputField
        label="Senha inicial"
        type="password"
        autoComplete="new-password"
        value={form.password}
        onChange={(e) => update('password')(e.target.value)}
        error={errors.password}
      />
      <SelectField label="Perfil" value={form.role} onChange={(e) => update('role')(e.target.value)} error={errors.role}>
        <option value="customer">Cliente</option>
        <option value="admin">Administrador</option>
      </SelectField>
      <Button variant="primary" type="submit" isLoading={createUser.isPending}>
        Criar usuário
      </Button>
    </form>
  )
}

export const AdminUsersPage = () => {
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [role, setRole] = useState<UserRole | null>(null)
  const [search, setSearch] = useState('')
  const q = useDebounce(search.trim(), 350)
  const usersQuery = useUserList({ role, q })
  const setActive = useSetUserActive()

  usePageMeta('Usuários — Admin')

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Gestão</p>
        <h2 className="h1" style={{ margin: 0 }}>Usuários</h2>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        <div className="card" style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
          <div className="filter-pills" role="group" aria-label="Filtrar por perfil">
            {ROLE_TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                aria-pressed={tab.role === role}
                className={`filter-pill ${tab.role === role ? 'active' : ''}`}
                onClick={() => setRole(tab.role)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <InputField
            label="Buscar por nome ou e-mail (mín. 2 letras)"
            type="search"
            maxLength={60}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {usersQuery.isPending ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={64} />)
          ) : usersQuery.isError ? (
            <Alert tone="danger">Não foi possível carregar os usuários.</Alert>
          ) : usersQuery.users.length === 0 ? (
            <EmptyState title="Nenhum usuário" description="Ajuste os filtros ou cadastre um novo usuário." />
          ) : (
            usersQuery.users.map((user) => {
              const isSelf = user.id === currentUserId
              const pending = setActive.isPending && setActive.variables?.id === user.id
              return (
                <div key={user.id} className="admin-list-row">
                  <div style={{ display: 'grid', gap: '0.25rem', minWidth: 0 }}>
                    <strong>
                      {user.full_name}
                      {isSelf && <span className="caption"> (você)</span>}
                    </strong>
                    <span className="caption">
                      {user.email} · {formatRole(user.role)}
                    </span>
                    <span className="caption">Último acesso: {formatDateTime(user.last_login_at)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
                    <Badge tone={user.is_active ? 'success' : 'error'}>{user.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    {user.is_active ? (
                      <Button
                        variant="danger"
                        size="sm"
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
                  </div>
                </div>
              )
            })
          )}

          <LoadMore
            hasNextPage={usersQuery.hasNextPage}
            isFetchingNextPage={usersQuery.isFetchingNextPage}
            onLoadMore={() => void usersQuery.fetchNextPage()}
          />
        </div>

        <NewUserForm />
      </div>
    </div>
  )
}
