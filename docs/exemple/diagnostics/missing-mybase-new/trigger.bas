' @example: diagnostics/missing-mybase-new/trigger
' @demonstrates: construtor Sub New sem chamada a MyBase.New()
' @diagnostics: missing-mybase-new@5
'
Namespace mod_demo_ctor
   Class TProduto

      Public Codigo As String

      Sub New(pCodigo As String)
         me.Codigo = pCodigo
      End Sub

   End Class
End Namespace
