' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/optional-chain/02-method-call.
'
Namespace mod_demo
   Class TDemo
      Public Sub Liberar(pForm As TForm)
         If pForm <> NULL Then
            pForm.Free()
         End If
      End Sub
   End Class
End Namespace
