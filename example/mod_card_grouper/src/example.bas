
'Demonstração de funcionamento de herança, shadowing e sobreposição'
Class Nivel1

   PropNivel1 As String

   Sub New()
      MyBase.New()
   End Sub

   Overridable Sub SubOverridablePrinte(pValue As String, pLevel As Integer)
   print("SubOverridablePrinte: " & me.FuncBuildMessage(pValue, pLevel))
End Sub

Sub SubPrinte(pMessage As String)
   me.SubOverridablePrinte(pMessage, 1)
End Sub

Function FuncBuildMessage(pMessage As String, pLevel As Integer) As String
   FuncBuildMessage = pMessage & " (Nivel " & Cstr(pLevel) & ")"
End Function

Sub Free()
   MyBase.Free()
End Sub

End Class

Class Nivel2
   Inherits Nivel1

   PropNivel2 As String

   Sub New()
      MyBase.New()
   End Sub

   Sub SubPrinte(pMessage As String)
      me.SubOverridablePrinte(pMessage, 2)
   End Sub

   Function FuncBuildMessage(pMessage As String, pLevel As Integer) As Integer
      FuncBuildMessage = Len(MyBase.FuncBuildMessage(pMessage, pLevel))
   End Function

   Sub Free()
      MyBase.Free()
   End Sub

End Class

Class Nivel3
   Inherits Nivel2

   PropNivel3 As String

   Sub New()
      MyBase.New()
   End Sub

   Sub Free()
      MyBase.Free()
   End Sub

End Class

Class Nivel4
   Inherits Nivel3

   PropNivel4 As String

   Sub New()
      MyBase.New()
   End Sub

   Overrides Sub SubOverridablePrinte(pValue As String, pLevel As Integer)
   print("Nivel4: Length: " & me.FuncBuildMessage(pValue, pLevel).ToString())
End Sub

Sub SubPrinte(pMessage As String)
   MyBase.SubPrinte(pMessage + " (Nivel Builded 4)")
End Sub

Sub Free()
   MyBase.Free()
End Sub

End Class

Dim _nivel1 As Nivel1 = New Nivel1()
'Autocomplete:
'Dim PropNivel1 As UnicodeString
'Sub SubOverridablePrinte(pValue As UnicodeString, pLevel As Integer)
'Sub SubPrinte(pMessage As UnicodeString)
'Function FuncBuildMessage(pMessage As UnicodeString, pLevel As Integer) As UnicodeString
'... Tudo de TObject
_nivel1.SubPrinte("Oi 1")

Dim _nivel2 As Nivel2 = New Nivel2()
' Autocomplete:
'Dim PropNivel2 As UnicodeString
'Sub SubPrinte(pMessage As UnicodeString)
'Function FuncBuildMessage(pMessage As UnicodeString, pLevel As Integer) As Integer
'Dim PropNivel1 As UnicodeString
'Sub SubOverridablePrinte(pValue As UnicodeString, pLevel As Integer)
'... Tudo de TObject
_nivel2.SubPrinte("Oi 2")

' Agora a FuncBuildMessage retorna Integer, pois foi sobrescrita implicitamente já que a quantidade de params é igual.
' Se tentar ler o retorno como string vai ter erro, o compiler retorna que o tipo é integer, ele só é string na instacia de Nivel1
Dim _lenStr As String = Nivel1(_nivel2).FuncBuildMessage("Teste 2", 2)
print _lenStr
Dim _len As Integer = _nivel2.FuncBuildMessage("Teste 2", 2)
print _len

Dim _nivel3 As Nivel3 = New Nivel3()
' Autocomplete:
'Dim PropNivel3 As UnicodeString
'Dim PropNivel2 As UnicodeString
'Sub SubPrinte(pMessage As UnicodeString)
'Function FuncBuildMessage(pMessage As UnicodeString, pLevel As Integer) As Integer
'Dim PropNivel1 As UnicodeString
'Sub SubOverridablePrinte(pValue As UnicodeString, pLevel As Integer)
'... Tudo de TObject
_nivel3.SubPrinte("Oi 3")

Dim _nivel4 As Nivel4 = New Nivel4()
' Autocomplete:
'Dim PropNivel4 As UnicodeString
'Sub SubPrinte(pMessage As UnicodeString)
'Sub SubOverridablePrinte(pValue As UnicodeString, pLevel As Integer)
'Dim PropNivel3 As UnicodeString
'Dim PropNivel2 As UnicodeString
'Function FuncBuildMessage(pMessage As UnicodeString, pLevel As Integer) As Integer
'Dim PropNivel1 As UnicodeString
'... Tudo de TObject
_nivel4.SubPrinte("Oi 4")