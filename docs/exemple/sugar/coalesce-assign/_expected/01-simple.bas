' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/coalesce-assign/01-simple.
'
Namespace mod_demo
   Class TDemo
      Public Sub Apply(pConfig As String)
         If pConfig = NULL Then
            pConfig = "default"
         End If
         Print pConfig
      End Sub
   End Class
End Namespace
