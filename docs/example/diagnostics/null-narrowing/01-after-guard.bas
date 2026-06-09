' @example: diagnostics/null-narrowing/01-after-guard
' @demonstrates: TypeResolver propaga NotNull(x) após If x = NULL Then Return
' @diagnostics: none
'
' Após o guard "If pAdm = NULL Then Throw...", o resolver sabe que pAdm é
' não-NULL no resto do método; o acesso .AsString é seguro e não emite
' avisos.
'
Namespace mod_demo
   Class TDemo
      Public Function Resolver(pAdm As CardAdm) As String
         If pAdm = NULL Then Throw New Exception("inválido")
         Resolver = pAdm.AsString
      End Function
   End Class
End Namespace
