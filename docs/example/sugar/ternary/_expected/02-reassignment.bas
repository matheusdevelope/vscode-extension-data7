' @example: sugar/ternary/_expected/02-reassignment
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/ternary/02-reassignment
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      ativo As Boolean
      Public Sub Toggle(condicao As Boolean)
         If condicao Then
            ativo = True
         Else
            ativo = False
         End If
      End Sub
   End Class
End Namespace
