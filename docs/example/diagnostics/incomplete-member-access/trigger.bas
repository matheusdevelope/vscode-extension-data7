' @example: diagnostics/incomplete-member-access/trigger
' @demonstrates: acesso a membro encerrado no ponto sem nome de membro
' @diagnostics: incomplete-member-access@8
'
Namespace mod_incomplete_member_access
   Sub Run(pItem As TObject)
      pItem.
   End Sub
End Namespace
