' @example: sugar/optional-chain/02-method-call
' @demonstrates: ?. em chamada de método — vira If obj <> NULL Then obj.Method()
' @diagnostics: none
' @transpiled-to: sugar/optional-chain/_expected/02-method-call.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Liberar(pForm As TForm)
         pForm?.Free()
      End Sub
   End Class
End Namespace
