' @example: sugar/generic-tlist/02-delegate
' @demonstrates: Delegate Function genérico monomorfizado para tipo concreto
' @diagnostics: none
' @transpiled-to: sugar/generic-tlist/_expected/02-delegate.bas
'
Namespace mod_demo


   Class Helper
      Shared Function Maior(pValue As Integer) As Boolean
         Maior = pValue > 100
      End Function
   End Class

   Class TDemo
      Public Sub Run()
         Dim handler As Pred_Integer = Helper.Maior
      End Sub
   End Class

   Delegate Function Pred_Integer(pValue As Integer) As Boolean
End Namespace
