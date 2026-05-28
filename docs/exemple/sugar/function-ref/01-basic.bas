' @example: sugar/function-ref/01-basic
' @demonstrates: function reference convencional (sem `@`) — handler nomeado
' @diagnostics: none
'
' A forma açucarada `@Helper.FindByName` ainda NÃO é transpilada (requer
' validação de assinatura compile-time). A convenção atual é referenciar
' diretamente a Shared Function como abaixo — o linter usa a assinatura
' do Delegate para validar compatibilidade.
'
Namespace mod_demo

   Delegate Function CardRecordFindDelegate(pValue As CardRecord, i As Integer, extra As Variant) As Boolean

   Class Helper
      Shared Function FindByName(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
         FindByName = (pValue.Nome = CStr(extra))
      End Function
   End Class

   Class TDemo
      Public Sub Run(lista As CardRecordList)
         Dim handler As CardRecordFindDelegate = Helper.FindByName
      End Sub
   End Class

End Namespace
