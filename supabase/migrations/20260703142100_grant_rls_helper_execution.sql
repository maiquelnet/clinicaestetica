grant usage on schema private to authenticated;

grant execute on function private.usuario_tem_acesso_clinica(uuid) to authenticated;
grant execute on function private.usuario_e_admin_clinica(uuid) to authenticated;
