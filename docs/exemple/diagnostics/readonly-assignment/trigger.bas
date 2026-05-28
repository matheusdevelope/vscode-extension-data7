' @example: diagnostics/readonly-assignment/trigger
' @demonstrates: atribuição a campo ReadOnly fora do construtor
' @diagnostics: readonly-assignment@11
' @requires: emissão futura do linter quando a checagem ReadOnly for implementada (I3)
'
Namespace mod_demo
   Class TConfig
      ReadOnly _id As Integer

      Sub New(pId As Integer)
         me._id = pId
      End Sub

      Sub Reset(pNovo As Integer)
         me._id = pNovo
      End Sub
   End Class
End Namespace
